import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import { SUBSTITUTION_BAND_YEN_PER_100G } from '@/lib/platformParams'
import type {
  BeanRecord,
  LabelSnapshotEntry,
  ProcurementEntry,
  RoasterRecord,
  SubstitutionEntry,
} from '@/types/platform'

// 差替（§6.3）。「抜く」は v1 で作らず、**差替 or 全額返金の2択**。
// 候補は Sikō が推薦し、確定は必ず購入者の承認を挟む（同一性の帰属を購入者に残すため）。

export interface OrderForSubstitution {
  id: string
  status?: string
  labelSnapshot?: LabelSnapshotEntry[]
  procurement?: ProcurementEntry[]
  substitution?: SubstitutionEntry[]
}

export async function getOrderForSubstitution(orderId: string): Promise<OrderForSubstitution | null> {
  const res = await getDocClient().send(new GetCommand({ TableName: TABLE.ORDERS, Key: { id: orderId } }))
  return (res.Item as OrderForSubstitution | undefined) ?? null
}

export type ProposeResult =
  | { ok: true; entry: SubstitutionEntry }
  | { ok: false; error: string; status: number }

// 推薦の妥当性（§6.3）:
//   ① 元豆が注文に含まれること
//   ② 代替豆が購入可能（orderStatus="on" ＋ 焙煎者 active）
//   ③ 同系統＝生豆生産国か焙煎度が近いこと
//   ④ 推薦バンド ±¥100/100g 圏（味の方向性と価格差の両方を有界化）
export async function proposeSubstitution(
  order: OrderForSubstitution,
  fromBeanId: string,
  toBeanId: string,
): Promise<ProposeResult> {
  const line = order.labelSnapshot?.find((l) => l.beanId === fromBeanId)
  if (!line) return { ok: false, error: '差替元の豆がこの注文に含まれていません', status: 404 }
  if (order.substitution?.some((s) => s.fromBeanId === fromBeanId && !s.declinedByBuyerAt)) {
    return { ok: false, error: 'この豆には未確定の差替提案があります', status: 409 }
  }

  const db = getDocClient()
  const beanRes = await db.send(new GetCommand({ TableName: TABLE.BEANS, Key: { beanId: toBeanId } }))
  const toBean = beanRes.Item as BeanRecord | undefined
  if (!toBean) return { ok: false, error: '代替候補の豆が見つかりません', status: 404 }
  if (toBean.orderStatus !== 'on') {
    return { ok: false, error: '代替候補が受付を停止しています', status: 409 }
  }

  const roasterRes = await db.send(
    new GetCommand({ TableName: TABLE.ROASTERS, Key: { roasterId: toBean.roasterId } }),
  )
  const roaster = roasterRes.Item as RoasterRecord | undefined
  if (!roaster || roaster.status !== 'active') {
    return { ok: false, error: '代替候補の焙煎者が販売中ではありません', status: 409 }
  }

  const sameFamily = toBean.greenOrigin === line.greenOrigin || toBean.roastLevel === line.roastLevel
  if (!sameFamily) {
    return { ok: false, error: '同系統（生豆生産国か焙煎度が近い）の豆から選んでください', status: 400 }
  }

  const deltaPer100g = toBean.pricePer100g - line.pricePer100g
  if (Math.abs(deltaPer100g) > SUBSTITUTION_BAND_YEN_PER_100G) {
    return {
      ok: false,
      error: `推薦バンド（±¥${SUBSTITUTION_BAND_YEN_PER_100G}/100g）を超える価格差です`,
      status: 400,
    }
  }

  const entry: SubstitutionEntry = {
    fromBeanId,
    toBeanId,
    toBeanName: toBean.name,
    deltaYen: Math.round((line.grams / 100) * deltaPer100g),
    deltaPer100g,
    // 吸収バンド内＝Sikō が飲む＝購入者の支払額は据え置き（§6.1.2 のスナップショット固定と整合）
    absorbedBySiko: Math.abs(deltaPer100g) <= SUBSTITUTION_BAND_YEN_PER_100G,
    proposedAt: new Date().toISOString(),
  }

  await db.send(
    new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: order.id },
      UpdateExpression: 'SET substitution = list_append(if_not_exists(substitution, :empty), :e), updatedAt = :now',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeValues: { ':e': [entry], ':empty': [], ':now': new Date().toISOString() },
    }),
  )

  return { ok: true, entry }
}

// 購入者の辞退を記録する（返金の実行は refundOrder 側）。
export async function markSubstitutionDeclined(
  order: OrderForSubstitution,
  entry: SubstitutionEntry,
): Promise<void> {
  const now = new Date().toISOString()
  const substitution = (order.substitution ?? []).map((s) =>
    s.fromBeanId === entry.fromBeanId && s.toBeanId === entry.toBeanId && !s.declinedByBuyerAt
      ? { ...s, declinedByBuyerAt: now }
      : s,
  )
  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: order.id },
      UpdateExpression: 'SET substitution = :sub, updatedAt = :now',
      ConditionExpression: 'attribute_exists(id) AND size(substitution) = :len',
      ExpressionAttributeValues: { ':sub': substitution, ':len': (order.substitution ?? []).length, ':now': now },
    }),
  )
}

// 購入者の承認で差替を確定する。
// 副作用（§6.3 の実装要件）: ①法定ラベルの再生成 ②価格差の扱い ③新バージョン扱いの記録。
export async function approveSubstitution(
  order: OrderForSubstitution,
  entry: SubstitutionEntry,
): Promise<{ labelSnapshot: LabelSnapshotEntry[]; procurement: ProcurementEntry[] } | null> {
  const db = getDocClient()
  const beanRes = await db.send(new GetCommand({ TableName: TABLE.BEANS, Key: { beanId: entry.toBeanId } }))
  const toBean = beanRes.Item as BeanRecord | undefined
  if (!toBean) return null

  const now = new Date().toISOString()

  // ① ラベル再生成: 生豆生産国・焙煎度・価格が変わるため行を差し替える（比率と量は保つ＝作品の同一性）
  const labelSnapshot = (order.labelSnapshot ?? []).map((l) =>
    l.beanId === entry.fromBeanId
      ? {
          ...l,
          beanId: toBean.beanId,
          roasterId: toBean.roasterId,
          name: toBean.name,
          greenOrigin: toBean.greenOrigin,
          roastLevel: toBean.roastLevel,
          // ② 吸収バンド内なので購入者の支払額は据え置き。表示価格だけ実体に合わせる。
          pricePer100g: toBean.pricePer100g,
        }
      : l,
  )

  const procurement = (order.procurement ?? []).map((p) =>
    p.beanId === entry.fromBeanId
      ? { ...p, beanId: toBean.beanId, roasterId: toBean.roasterId, mode: 'po' as const, poStatus: 'pending' as const }
      : p,
  )

  const substitution = (order.substitution ?? []).map((s) =>
    s.fromBeanId === entry.fromBeanId && s.toBeanId === entry.toBeanId && !s.approvedByBuyerAt
      ? { ...s, approvedByBuyerAt: now }
      : s,
  )

  await db.send(
    new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: order.id },
      UpdateExpression: [
        'SET labelSnapshot = :label',
        'procurement = :proc',
        'substitution = :sub',
        '#e = :none',
        'updatedAt = :now',
      ].join(', '),
      // ③ 二重承認の防止（承認済みが増えていたら弾く）
      ConditionExpression: 'attribute_exists(id) AND size(substitution) = :len',
      ExpressionAttributeNames: { '#e': 'exception' },
      ExpressionAttributeValues: {
        ':label': labelSnapshot,
        ':proc': procurement,
        ':sub': substitution,
        ':none': null,
        ':len': (order.substitution ?? []).length,
        ':now': now,
      },
    }),
  )

  return { labelSnapshot, procurement }
}
