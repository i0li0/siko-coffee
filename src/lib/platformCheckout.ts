import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import { planLotAllocations, type Allocation } from '@/lib/reservations'
import { poTimeoutAt } from '@/lib/platformParams'
import type {
  BeanRecord,
  LabelSnapshotEntry,
  ProcurementEntry,
  RoasterRecord,
} from '@/types/platform'

// プラットフォーム構成のブレンドを「サーバ側の真実」で解決する（§13.3・§11.4）。
// クライアントから来るのは beanId と比率だけ。価格・可否・生産国は beans/roasters を
// forward Get して決める（§11.4：状態はブレンドに持たせず、都度参照先を見る）。

// 発送準備日数。PO（発注）ぶんのリードタイムに足して etaPromised を出す（§6.3 の遅延Δの基準）。
export const SHIP_PREP_DAYS = 3

export interface ResolvedComponent {
  bean: BeanRecord
  roaster: RoasterRecord
  ratioPct: number
  grams: number
  amountYen: number
}

export interface ResolvedItem {
  components: ResolvedComponent[]
  amountYen: number
  allocations: Allocation[]
  procurement: ProcurementEntry[]
  labelSnapshot: LabelSnapshotEntry[]
  etaDays: number
}

export type ResolveResult = { ok: true; item: ResolvedItem } | { ok: false; error: string; status: number }

interface RequestedComponent {
  beanId: string
  ratioPct: number
}

// blendId 指定なら保存済みブレンドの構成を正とする（クライアントの比率は見ない）。
async function loadBlendComponents(
  blendId: string,
  userId: string | null,
): Promise<RequestedComponent[] | null> {
  const res = await getDocClient().send(new GetCommand({ TableName: TABLE.BLENDS, Key: { id: blendId } }))
  const blend = res.Item as
    | { components?: RequestedComponent[]; visibility?: string; createdBy?: string }
    | undefined
  if (!blend?.components?.length) return null // 旧形式（ratios だけ）のブレンドは対象外
  // 非公開ブレンドは作成者のみ購入できる
  if (blend.visibility === 'private' && blend.createdBy !== userId) return null
  return blend.components.map((c) => ({ beanId: c.beanId, ratioPct: c.ratioPct }))
}

export async function resolvePlatformItem(
  input: { blendId?: string; components?: RequestedComponent[]; grams: number },
  userId: string | null,
): Promise<ResolveResult> {
  const requested = input.blendId
    ? (await loadBlendComponents(input.blendId, userId)) ?? input.components
    : input.components
  if (!requested?.length) {
    return { ok: false, error: 'ブレンドの構成が見つかりません', status: 404 }
  }

  const db = getDocClient()
  const components: ResolvedComponent[] = []
  const allocations: Allocation[] = []
  const procurement: ProcurementEntry[] = []
  const labelSnapshot: LabelSnapshotEntry[] = []
  let amountYen = 0
  let etaDays = SHIP_PREP_DAYS

  for (const req of requested) {
    const beanRes = await db.send(new GetCommand({ TableName: TABLE.BEANS, Key: { beanId: req.beanId } }))
    const bean = beanRes.Item as BeanRecord | undefined
    if (!bean) return { ok: false, error: '選択された豆が見つかりません', status: 404 }
    if (bean.orderStatus !== 'on') {
      return { ok: false, error: `「${bean.name}」は現在受付を停止しています`, status: 409 }
    }

    const roasterRes = await db.send(
      new GetCommand({ TableName: TABLE.ROASTERS, Key: { roasterId: bean.roasterId } }),
    )
    const roaster = roasterRes.Item as RoasterRecord | undefined
    // active＝通常販売、selling_out＝退会後の売り切り（在庫ぶんのみ・新規焙煎の発注は不可・§6.2.1）
    if (!roaster || (roaster.status !== 'active' && roaster.status !== 'selling_out')) {
      return { ok: false, error: `「${bean.name}」は現在購入できません`, status: 409 }
    }

    const grams = Math.round((input.grams * req.ratioPct) / 100)
    if (grams <= 0) continue
    const componentAmount = Math.round((grams / 100) * bean.pricePer100g)
    amountYen += componentAmount

    components.push({ bean, roaster, ratioPct: req.ratioPct, grams, amountYen: componentAmount })
    labelSnapshot.push({
      beanId: bean.beanId,
      roasterId: bean.roasterId,
      name: bean.name,
      greenOrigin: bean.greenOrigin,
      roastLevel: bean.roastLevel,
      ratioPct: req.ratioPct,
      grams,
      pricePer100g: bean.pricePer100g,
    })

    const plan = await planLotAllocations(bean.beanId, bean.roasterId, grams)
    allocations.push(...plan.allocations)

    if (plan.shortfallG <= 0) {
      procurement.push({ roasterId: bean.roasterId, beanId: bean.beanId, qtyG: grams, mode: 'stock' })
      continue
    }

    // 在庫不足ぶんは発注（PO）。売り切り中の焙煎者は新規焙煎を受けられないので購入不可にする（§6.3 抜く禁止）。
    if (roaster.status === 'selling_out') {
      return { ok: false, error: `「${bean.name}」は在庫限りのため、この量は購入できません`, status: 409 }
    }
    // 週上限内なら自動承認、超過は焙煎者の応答待ち（既定48h・§6.2／閾値は §6.3 の設定値）
    // ※ 週次の受注実績は現状どこにも集計していないため、判定は「この注文単体 vs 週上限」の近似。
    const autoApproved = plan.shortfallG / 1000 <= bean.weeklyCapKg
    procurement.push({
      roasterId: bean.roasterId,
      beanId: bean.beanId,
      qtyG: grams,
      mode: 'po',
      poStatus: autoApproved ? 'auto_approved' : 'pending',
      leadTimeDays: bean.leadTimeDays,
      ...(autoApproved ? {} : { timeoutAt: poTimeoutAt() }),
    })
    etaDays = Math.max(etaDays, SHIP_PREP_DAYS + bean.leadTimeDays)
  }

  if (components.length === 0) {
    return { ok: false, error: 'ブレンドの構成が不正です', status: 400 }
  }

  return { ok: true, item: { components, amountYen, allocations, procurement, labelSnapshot, etaDays } }
}

export function etaFromDays(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() + days * 24 * 3600 * 1000).toISOString()
}
