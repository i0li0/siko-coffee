import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import {
  checkRateLimit,
  recordFailure,
  resetFailures,
  checkGlobalRateLimit,
  recordGlobalFailure,
} from '@/lib/adminRateLimit'
import { createSessionToken } from '@/lib/adminSession'
import {
  getCredentials,
  recordCredentialUse,
  getRpConfig,
  createChallengeToken,
  consumeChallengeToken,
  CHALLENGE_COOKIE,
} from '@/lib/adminPasskey'

function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

// GET: 認証用 options を発行（未ログインで利用）
export async function GET(request: NextRequest) {
  const creds = await getCredentials()
  if (creds.length === 0) {
    return NextResponse.json({ error: 'no_passkeys' }, { status: 404 })
  }

  const { rpID } = getRpConfig(request.url)
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: creds.map(c => ({
      id: Buffer.from(c.id, 'base64url'),
      type: 'public-key' as const,
      transports: c.transports as ('ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb')[] | undefined,
    })),
  })

  const response = NextResponse.json(options)
  response.cookies.set(CHALLENGE_COOKIE, await createChallengeToken(options.challenge), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300,
    path: '/',
  })
  return response
}

// POST: 認証レスポンスを検証してセッションを発行（パスワード単体ログインと同等のセッション）
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  // パスワード経路と同じく、グローバル（全IP合算）制限を先に評価して
  // 分散総当たり/DoS を抑止する。
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

  const expectedChallenge = await consumeChallengeToken(request.cookies.get(CHALLENGE_COOKIE)?.value)
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'チャレンジの有効期限が切れました。やり直してください。' }, { status: 400 })
  }

  let authResponse: { id?: string }
  try {
    const body = await request.json()
    authResponse = body.response
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!authResponse?.id) {
    return NextResponse.json({ error: 'response is required' }, { status: 400 })
  }

  const creds = await getCredentials()
  const stored = creds.find(c => c.id === authResponse.id)
  if (!stored) {
    await recordFailure(ip)
    await recordGlobalFailure()
    return NextResponse.json({ error: '登録されていないパスキーです' }, { status: 401 })
  }

  const { rpID, origin } = getRpConfig(request.url)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: authResponse as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      authenticator: {
        credentialID: Buffer.from(stored.id, 'base64url'),
        credentialPublicKey: Buffer.from(stored.publicKey, 'base64url'),
        counter: stored.counter,
        transports: stored.transports as ('ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb')[] | undefined,
      },
    })
  } catch {
    await recordFailure(ip)
    await recordGlobalFailure()
    return NextResponse.json({ error: 'パスキー認証に失敗しました' }, { status: 401 })
  }

  if (!verification.verified) {
    await recordFailure(ip)
    await recordGlobalFailure()
    Sentry.captureMessage('Admin login failed: passkey', {
      level: 'warning',
      tags: { event: 'admin_login_failure', reason: 'passkey' },
      extra: { ip },
    })
    return NextResponse.json({ error: 'パスキー認証に失敗しました' }, { status: 401 })
  }

  // counter と最終利用時刻を更新（リプレイ検出 + 不審利用の可視化）
  await recordCredentialUse(stored.id, verification.authenticationInfo.newCounter)
  await resetFailures(ip)

  const sessionToken = await createSessionToken()

  Sentry.captureMessage('Admin login success (passkey)', {
    level: 'info',
    tags: { event: 'admin_login_success', method: 'passkey' },
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
  response.cookies.delete(CHALLENGE_COOKIE)
  return response
}
