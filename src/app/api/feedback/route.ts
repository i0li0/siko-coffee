import { NextRequest, NextResponse } from 'next/server'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { feedbackSchema } from '@/lib/validation'
import {
  normalizeSource,
  hashIp,
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackItem,
} from '@/lib/feedback'
import { notifySlack } from '@/lib/slackNotify'

export const preferredRegion = ['hnd1']

// POST /api/feedback — 公開・匿名。送信者の個人情報は一切保存しない。
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))

  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 })
  }

  // ハニーポット: 隠しフィールドに値があれば bot とみなし、成功を装って静かに破棄。
  if (parsed.data.website) {
    return NextResponse.json({ ok: true })
  }

  // レート制限の識別子はハッシュ化IP。生IPもハッシュもフィードバック本体には保存しない。
  const ipHash = hashIp(getClientIp(request.headers))
  const { allowed, retryAfter } = await checkGeneralRateLimit(ipHash, {
    prefix: 'feedback',
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000,
  })
  if (!allowed) {
    return NextResponse.json(
      { error: '送信回数が上限に達しました。しばらくしてから再度お試しください' },
      { status: 429, headers: { 'Retry-After': String(retryAfter ?? 600) } },
    )
  }

  const source = normalizeSource(parsed.data.from)
  const createdAt = new Date().toISOString()

  const item: FeedbackItem = {
    feedbackId: randomUUID(),
    content: parsed.data.content,
    source,
    category: parsed.data.category,
    status: 'new',
    createdAt,
    gsiPk: 'FEEDBACK',
    gsiSk: createdAt,
  }

  if (!isDbConfigured()) {
    // 認証情報の無い環境（CI 等）では保存をスキップしても 500 にしない。
    return NextResponse.json({ ok: true })
  }

  try {
    await getDocClient().send(new PutCommand({ TableName: TABLE.FEEDBACK, Item: item }))
  } catch (err) {
    console.error('Feedback POST error:', err)
    return NextResponse.json({ error: '送信に失敗しました。時間をおいて再度お試しください' }, { status: 500 })
  }

  // 新着通知（本文＋導線のみ。個人情報は無い）。失敗してもユーザー操作はブロックしない。
  void notifySlack(
    `📝 新しいフィードバック [${FEEDBACK_SOURCE_LABELS[source]} / ${FEEDBACK_CATEGORY_LABELS[parsed.data.category]}]\n${parsed.data.content}`,
  )

  return NextResponse.json({ ok: true })
}
