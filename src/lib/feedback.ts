import { createHash } from 'crypto'

// フィードバックは「匿名・非公開」。本体に保存するのは source / 本文 / カテゴリ / status / 日時 のみ。
// 名前・メール・userId・IP・User-Agent は一切保存しない（個人を特定しない）。

// どの導線（リンク）から来たか。各設置場所に ?from=<タグ> を付けて区別する。
// 未知の値はすべて 'other' に丸める（生のリファラ等を保存しない）。
export const FEEDBACK_SOURCES = [
  'footer',     // 全ページ共通フッター
  'shop',       // ショップ
  'order',      // 注文完了・配送メール
  'instagram',  // Instagram プロフィール
  'qr',         // 店頭QR（レシート・梱包）
  'direct',     // 直接アクセス（from 指定なし）
  'other',      // 上記以外
] as const

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number]

export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = {
  footer: 'フッター',
  shop: 'ショップ',
  order: '注文・配送',
  instagram: 'Instagram',
  qr: '店頭QR',
  direct: '直接アクセス',
  other: 'その他',
}

export const FEEDBACK_CATEGORIES = ['opinion', 'bug', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  opinion: 'ご意見・ご感想',
  bug: '不具合の報告',
  other: 'その他',
}

export type FeedbackStatus = 'new' | 'read' | 'archived'

export type FeedbackItem = {
  feedbackId: string
  content: string
  source: FeedbackSource
  category: FeedbackCategory
  status: FeedbackStatus
  createdAt: string
  // 一覧を新着降順で Query するための GSI（Scan を使わない）
  gsiPk: 'FEEDBACK'
  gsiSk: string
}

export const FEEDBACK_GSI = {
  NAME: 'list-index',
  PK: 'FEEDBACK',
} as const

export const FEEDBACK_CONTENT_MAX = 2000

/** 受け取った from 値をホワイトリストに丸める */
export function normalizeSource(raw: string | null | undefined): FeedbackSource {
  if (!raw) return 'direct'
  const v = raw.toLowerCase().trim()
  return (FEEDBACK_SOURCES as readonly string[]).includes(v) ? (v as FeedbackSource) : 'other'
}

/**
 * IP をハッシュ化してレート制限の識別子にする。
 * 生IPは保存せず、ハッシュは rateLimit 用に CONFIG テーブルへ TTL 付きで一時記録されるだけ。
 * → フィードバック本文と個人が結びつかない。
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`feedback:${ip}`).digest('hex').slice(0, 32)
}
