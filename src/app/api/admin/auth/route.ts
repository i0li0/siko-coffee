import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { checkAdminPassword } from '@/lib/adminPassword'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/adminRateLimit'
import { createSessionToken, revokeSession } from '@/lib/adminSession'
import { getTotpSecret } from '@/lib/adminTotp'
import { verifySync } from 'otplib'

function getClientIp(req: NextRequest): string {
  // Vercel が付与する x-real-ip は実クライアントIP（詐称不可）。
  // x-forwarded-for の先頭値はクライアントが任意に詐称でき、レート制限を回避できるため使わない。
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  // 非 Vercel 環境（ローカル等）向けフォールバック。
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const { allowed, retryAfter } = await checkRateLimit(ip)

  if (!allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  let password: string, totpCode: string | undefined
  try {
    const body = await request.json()
    password = body.password
    totpCode = body.totpCode
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!checkAdminPassword(password)) {
    await recordFailure(ip)
    Sentry.captureMessage('Admin login failed: wrong password', {
      level: 'warning',
      tags: { event: 'admin_login_failure', reason: 'password' },
      extra: { ip },
    })
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 })
  }

  const totpSecret = await getTotpSecret()
  if (totpSecret) {
    if (!totpCode) {
      return NextResponse.json({ requireTotp: true }, { status: 200 })
    }
    const result = verifySync({ token: String(totpCode), secret: totpSecret })
    const isValid = result.valid
    if (!isValid) {
      await recordFailure(ip)
      Sentry.captureMessage('Admin login failed: wrong TOTP', {
        level: 'warning',
        tags: { event: 'admin_login_failure', reason: 'totp' },
        extra: { ip },
      })
      return NextResponse.json({ error: '認証コードが違います' }, { status: 401 })
    }
  }

  await resetFailures(ip)
  const sessionToken = await createSessionToken()

  Sentry.captureMessage('Admin login success', {
    level: 'info',
    tags: { event: 'admin_login_success' },
    extra: { ip },
  })

  const response = NextResponse.json({ ok: true })

  response.cookies.set('admin_session', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 25,
    path: '/',
  })

  return response
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value
  if (token) await revokeSession(token)

  const response = NextResponse.json({ ok: true })
  response.cookies.delete('admin_session')
  return response
}
