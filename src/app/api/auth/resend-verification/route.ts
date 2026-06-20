import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/verification-email'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const ip = getClientIp(request.headers)
  const { allowed, retryAfter } = await checkGeneralRateLimit(
    `${ip}:${session.user.email}`,
    { prefix: 'resendVerify', maxAttempts: 3, windowMs: 10 * 60 * 1000 },
  )
  if (!allowed) {
    return NextResponse.json(
      { error: '再送の上限に達しました。しばらくしてから再試行してください' },
      { status: 429, headers: { 'Retry-After': String(retryAfter ?? 600) } },
    )
  }

  const sent = await sendVerificationEmail(session.user.email)
  if (!sent) {
    return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
