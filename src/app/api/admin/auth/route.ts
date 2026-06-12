import { NextRequest, NextResponse } from 'next/server'
import { checkAdminPassword } from '@/lib/adminPassword'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/adminRateLimit'
import { createSessionToken } from '@/lib/adminSession'
import { verifySync } from 'otplib'

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const { allowed, retryAfter } = checkRateLimit(ip)

  if (!allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const { password, totpCode } = await request.json()

  if (!checkAdminPassword(password)) {
    recordFailure(ip)
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 })
  }

  const totpSecret = process.env.ADMIN_TOTP_SECRET
  if (totpSecret) {
    if (!totpCode) {
      recordFailure(ip)
      return NextResponse.json({ requireTotp: true }, { status: 200 })
    }
    const result = verifySync({ token: String(totpCode), secret: totpSecret })
    const isValid = result.valid
    if (!isValid) {
      recordFailure(ip)
      return NextResponse.json({ error: '認証コードが違います' }, { status: 401 })
    }
  }

  resetFailures(ip)
  const sessionToken = await createSessionToken()
  const response = NextResponse.json({ ok: true })

  response.cookies.set('admin_session', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('admin_session')
  return response
}
