import { NextRequest, NextResponse } from 'next/server'
import { generateSecret, verifySync } from 'otplib'
import QRCode from 'qrcode'
import { verifyAdminSession } from '@/lib/adminAuth'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/adminRateLimit'
import { getTotpSecret, saveTotpSecret, deleteTotpSecret } from '@/lib/adminTotp'

export async function GET() {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const existing = await getTotpSecret()

  const newSecret = generateSecret()
  const otpauthUrl =
    `otpauth://totp/${encodeURIComponent('Sikō Coffee:admin')}` +
    `?secret=${newSecret}&issuer=${encodeURIComponent('Sikō Coffee')}`
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

  return NextResponse.json({
    enabled: Boolean(existing),
    secret: newSecret,
    qrCodeDataUrl,
  })
}

function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

export async function POST(request: NextRequest) {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const rateLimitKey = `totp-setup:${getClientIp(request)}`
  const { allowed, retryAfter } = await checkRateLimit(rateLimitKey)
  if (!allowed) {
    return NextResponse.json(
      { error: `試行回数の上限に達しました。${retryAfter}秒後に再試行してください。` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  let secret: string, code: string
  try {
    const body = await request.json()
    secret = body.secret
    code = body.code
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!secret || !code) {
    return NextResponse.json({ error: 'secret and code are required' }, { status: 400 })
  }

  const result = verifySync({ token: String(code), secret })
  if (!result.valid) {
    await recordFailure(rateLimitKey)
    return NextResponse.json({ error: '認証コードが違います' }, { status: 400 })
  }

  await resetFailures(rateLimitKey)
  await saveTotpSecret(secret)

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const denied = await verifyAdminSession()
  if (denied) return denied

  await deleteTotpSecret()

  return NextResponse.json({ ok: true })
}
