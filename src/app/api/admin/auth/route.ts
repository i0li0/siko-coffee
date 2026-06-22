import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { checkAdminPassword } from '@/lib/adminPassword'
import {
  checkRateLimit,
  recordFailure,
  resetFailures,
  checkGlobalRateLimit,
  recordGlobalFailure,
} from '@/lib/adminRateLimit'
import { createSessionToken, revokeSession } from '@/lib/adminSession'
import { getTotpSecret, getLastUsedTotpStep, setLastUsedTotpStep } from '@/lib/adminTotp'
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

  // グローバル（全IP合算）制限を先に評価し、分散総当たりを抑止する。
  const global = await checkGlobalRateLimit()
  if (!global.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${global.retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(global.retryAfter) } }
    )
  }

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
    await recordGlobalFailure()
    Sentry.captureMessage('Admin login failed: wrong password', {
      level: 'warning',
      tags: { event: 'admin_login_failure', reason: 'password' },
      extra: { ip },
    })
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 })
  }

  const totpSecret = await getTotpSecret()

  // ADMIN_TOTP_REQUIRED=true なら TOTP 無しのログインを一切許可しない。
  // 秘密鍵が未設定なら設定ミスとしてフェイルクローズ（パスワードのみで通さない）。
  if (process.env.ADMIN_TOTP_REQUIRED === 'true' && !totpSecret) {
    Sentry.captureMessage('Admin login blocked: TOTP required but not configured', {
      level: 'error',
      tags: { event: 'admin_login_misconfig', reason: 'totp_missing' },
      extra: { ip },
    })
    return NextResponse.json(
      { error: '二要素認証が未設定のためログインできません。管理者に連絡してください。' },
      { status: 503 }
    )
  }

  if (totpSecret) {
    if (!totpCode) {
      return NextResponse.json({ requireTotp: true }, { status: 200 })
    }
    const result = verifySync({ token: String(totpCode), secret: totpSecret })
    if (!result.valid) {
      await recordFailure(ip)
      await recordGlobalFailure()
      Sentry.captureMessage('Admin login failed: wrong TOTP', {
        level: 'warning',
        tags: { event: 'admin_login_failure', reason: 'totp' },
        extra: { ip },
      })
      return NextResponse.json({ error: '認証コードが違います' }, { status: 401 })
    }

    // リプレイ防止: 直近に受理した time step 以下のコードは拒否する。
    // otplib の verifySync は TOTP/HOTP 共用型を返すため、TOTP 固有の timeStep を絞り込む。
    const matchedStep = 'timeStep' in result ? result.timeStep : undefined
    if (typeof matchedStep === 'number') {
      const lastStep = await getLastUsedTotpStep()
      if (lastStep !== null && matchedStep <= lastStep) {
        await recordFailure(ip)
        Sentry.captureMessage('Admin login failed: TOTP replay', {
          level: 'warning',
          tags: { event: 'admin_login_failure', reason: 'totp_replay' },
          extra: { ip },
        })
        return NextResponse.json({ error: '認証コードが違います' }, { status: 401 })
      }
      await setLastUsedTotpStep(matchedStep)
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
