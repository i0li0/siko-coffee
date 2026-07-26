// T1「待つ」導線（docs/blend-platform-plan.md §6.3 ①）。
//
// 課金後に構成豆の発注が遅れたとき、購入者に選択を迫るのは「遅れ幅が大きいときだけ」にする。
// 焙煎・発送の通常変動まで毎回聞くと摩擦ばかり増えるため、遅延 Δ を3段に切って扱いを変える。
//
//   Δ <= DELAY_SILENT_DAYS  … silent   : ETA を更新して知らせるだけ。選択肢は出さず待つ
//   Δ <= DELAY_CHOICE_DAYS  … choice   : 選択肢を提示するが注文は継続（待つ=既定・無操作でも進む）
//   Δ >  DELAY_CHOICE_DAYS  … required : サイレントの「待つ」を出さず能動選択を必須にする（実質 T2）
//
// 再プロンプトはしない。choice で通知済みなら required へ上がったときだけ1回エスカレーションする
// （§6.3「Tier B で通知済みなら Tier C 突入時のみ1回」）。

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import { DELAY_CHOICE_DAYS, DELAY_SILENT_DAYS } from '@/lib/platformParams'
import { SHIP_PREP_DAYS } from '@/lib/platformCheckout'
import { applyOrderException } from '@/lib/pos'
import { buildOrderUrl } from '@/lib/orderToken'
import { sendEmail, OWNER_EMAIL } from '@/lib/email'
import { etaDelayNotice } from '@/lib/emailTemplates'
import { notifySlack } from '@/lib/slackNotify'

export type DelayTier = 'silent' | 'choice' | 'required'

export interface OrderDelay {
  deltaDays: number
  tier: DelayTier
  beanId: string
  roasterId: string
  etaBefore: string
  etaAfter: string
  notifiedTier?: DelayTier // 通知済みの段。エスカレーション時のみ再通知するための記録
  updatedAt: string
}

const DAY_MS = 24 * 3600 * 1000

// 約束 ETA からの追加遅延（日）。切り上げ＝半日でも遅れたら1日として扱う（購入者に不利にしない）。
export function delayDays(promisedIso: string, currentIso: string): number {
  const promised = Date.parse(promisedIso)
  const current = Date.parse(currentIso)
  if (!Number.isFinite(promised) || !Number.isFinite(current)) return 0
  return Math.max(0, Math.ceil((current - promised) / DAY_MS))
}

export function classifyDelayTier(days: number): DelayTier {
  if (days <= DELAY_SILENT_DAYS) return 'silent'
  if (days <= DELAY_CHOICE_DAYS) return 'choice'
  return 'required'
}

// 応答時点から数え直した ETA。焙煎者のリードタイムは「発注を受けた日」から始まるため、
// 応答が遅れたぶんはそのまま着荷の遅れになる。
export function etaFromResponse(respondedAtIso: string, leadTimeDays: number): string {
  const base = Date.parse(respondedAtIso)
  const from = Number.isFinite(base) ? base : Date.now()
  return new Date(from + (SHIP_PREP_DAYS + Math.max(0, leadTimeDays)) * DAY_MS).toISOString()
}

const TIER_RANK: Record<DelayTier, number> = { silent: 0, choice: 1, required: 2 }

export interface RecalculateInput {
  orderId: string
  beanId: string
  roasterId: string
  leadTimeDays: number
  respondedAt?: string
}

export interface RecalculateResult {
  changed: boolean
  delay?: OrderDelay
  notified: boolean
}

// 発注が承認された時点で ETA を引き直し、遅延の段に応じて注文へ記録・通知する。
// 早まった場合（新 ETA が現在の ETA 以前）は何もしない＝良い方向の変動で購入者を煩わせない。
export async function recalculateOrderEta(input: RecalculateInput): Promise<RecalculateResult> {
  const db = getDocClient()
  const res = await db.send(new GetCommand({ TableName: TABLE.ORDERS, Key: { id: input.orderId } }))
  const order = res.Item
  if (!order?.etaPromised) return { changed: false, notified: false }

  const respondedAt = input.respondedAt ?? new Date().toISOString()
  const etaAfter = etaFromResponse(respondedAt, input.leadTimeDays)
  const etaBefore = (order.etaCurrent as string | undefined) ?? (order.etaPromised as string)

  // 前倒し・据え置きなら書き換えない
  if (Date.parse(etaAfter) <= Date.parse(etaBefore)) return { changed: false, notified: false }

  const deltaDays = delayDays(order.etaPromised as string, etaAfter)
  const tier = classifyDelayTier(deltaDays)
  const previous = order.delay as OrderDelay | undefined

  // silent は毎回そっと更新するだけ。choice/required は段が上がったときだけ通知する。
  const shouldNotify =
    tier !== 'silent' && TIER_RANK[tier] > TIER_RANK[previous?.notifiedTier ?? 'silent']

  const delay: OrderDelay = {
    deltaDays,
    tier,
    beanId: input.beanId,
    roasterId: input.roasterId,
    etaBefore,
    etaAfter,
    notifiedTier: shouldNotify ? tier : previous?.notifiedTier,
    updatedAt: new Date().toISOString(),
  }

  await db.send(
    new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: input.orderId },
      UpdateExpression: 'SET etaCurrent = :eta, #d = :delay, updatedAt = :now',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: { '#d': 'delay' },
      ExpressionAttributeValues: { ':eta': etaAfter, ':delay': delay, ':now': delay.updatedAt },
    }),
  )

  // 閾値超は「待つ」を既定にできない＝目処が立たないのと同じ扱いにして差替/返金へ送る（§6.3）
  if (tier === 'required') {
    await applyOrderException(input.orderId, {
      type: 'T2',
      beanId: input.beanId,
      roasterId: input.roasterId,
      reason: 'delay',
    })
  }

  if (!shouldNotify) return { changed: true, delay, notified: false }

  const customerEmail = order.customerEmail as string | undefined
  if (customerEmail) {
    const mail = etaDelayNotice({
      orderId: input.orderId,
      customerName: (order.customerName as string | undefined) ?? null,
      deltaDays,
      etaAfter,
      requiresChoice: tier === 'required',
      orderUrl: await buildOrderUrl(input.orderId),
    })
    await sendEmail({
      to: customerEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: OWNER_EMAIL,
    })
  }

  notifySlack(
    `⏳ 注文 ${input.orderId} の到着予定が ${deltaDays}日 遅延（${tier}）。豆 ${input.beanId} / 焙煎者 ${input.roasterId}`,
  )

  return { changed: true, delay, notified: true }
}
