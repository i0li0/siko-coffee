import { NextRequest, NextResponse } from 'next/server'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { verifyAdminSession } from '@/lib/adminAuth'
import { notifySlack } from '@/lib/slackNotify'
import {
  getCredentials,
  addCredential,
  getRpConfig,
  createChallengeToken,
  consumeChallengeToken,
  CHALLENGE_COOKIE,
} from '@/lib/adminPasskey'

// 共有 admin のため固定のユーザーハンドルを使う（個別アカウント化は将来検討）。
const ADMIN_USER_ID = 'siko-admin'

// GET: 登録用 options を発行（要ログイン）
export async function GET(request: NextRequest) {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const { rpID, rpName } = getRpConfig(request.url)
  const existing = await getCredentials()

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: ADMIN_USER_ID,
    userName: 'admin',
    attestationType: 'none',
    excludeCredentials: existing.map(c => ({
      id: Buffer.from(c.id, 'base64url'),
      type: 'public-key' as const,
      transports: c.transports as AuthenticatorTransportLike[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
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

// POST: 登録レスポンスを検証して認証情報を保存（要ログイン）
export async function POST(request: NextRequest) {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const expectedChallenge = await consumeChallengeToken(request.cookies.get(CHALLENGE_COOKIE)?.value)
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'チャレンジの有効期限が切れました。やり直してください。' }, { status: 400 })
  }

  let body: { response?: unknown; label?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.response) {
    return NextResponse.json({ error: 'response is required' }, { status: 400 })
  }

  const { rpID, origin } = getRpConfig(request.url)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      // @simplewebauthn/browser が生成した RegistrationResponseJSON
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch {
    return NextResponse.json({ error: 'パスキーの検証に失敗しました' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'パスキーの検証に失敗しました' }, { status: 400 })
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo
  const label = (typeof body.label === 'string' && body.label.trim()) || 'パスキー'

  const safeLabel = label.slice(0, 40)
  await addCredential({
    id: Buffer.from(credentialID).toString('base64url'),
    publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
    counter,
    transports: (body.response as { response?: { transports?: string[] } }).response?.transports,
    label: safeLabel,
    createdAt: Date.now(),
  })

  // 不正なセッション奪取後に攻撃者が永続化用の鍵を登録するのを検知できるよう、
  // 登録イベントを店主へ通知する（best-effort）。
  await notifySlack(`🔑 管理画面パスキーが新規登録されました: 「${safeLabel}」（身に覚えがなければ設定画面で削除してください）`)

  const response = NextResponse.json({ ok: true })
  response.cookies.delete(CHALLENGE_COOKIE)
  return response
}

// 型補助: v9 の transports 配列の型
type AuthenticatorTransportLike =
  'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'
