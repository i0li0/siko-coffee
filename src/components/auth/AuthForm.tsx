'use client'

import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  mode: 'login' | 'register'
  /** OAuth リダイレクト失敗時に /login?error= で渡るコード */
  oauthError?: string
}

// signIn callback / NextAuth が返すエラーコードを日本語案内に対応付ける。
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_link_unverified:
    'このメールアドレスは既存のアカウントで使用されています。メールアドレスの確認を完了するか、パスワードでログインしてからご利用ください。',
  oauth_provider_unverified:
    'ソーシャルアカウントのメールアドレスが未確認のため利用できません。',
  oauth_no_email:
    'メールアドレスを取得できませんでした。メールアドレスの共有を許可して再度お試しください。',
  // NextAuth 既定のエラー（guard をすり抜けた場合のフォールバック）
  OAuthAccountNotLinked:
    'このメールアドレスは別の方法で登録されています。元の方法でログインしてください。',
  AccessDenied: 'ログインが拒否されました。別の方法でお試しください。',
}

export default function AuthForm({ mode, oauthError }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // メール確認待ち画面（登録直後・未確認ログイン拒否時）。
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'register') {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || undefined }),
      })

      setLoading(false)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '登録に失敗しました')
        return
      }

      // メール確認必須のため自動ログインせず、確認待ち画面へ遷移する。
      setAwaitingVerification(true)
      return
    }

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      const code = (result as { code?: string }).code
      if (code === 'email_not_verified') {
        setAwaitingVerification(true)
        return
      }
      if (code === 'rate_limited') {
        setError('試行回数が多すぎます。しばらくしてから再度お試しください')
        return
      }
      setError('メールアドレスまたはパスワードが違います')
      return
    }

    router.push('/account')
    router.refresh()
  }

  function handleOAuth(provider: 'google' | 'line') {
    // 成功時は /account へ。失敗時は NextAuth が /login?error= に戻す。
    signIn(provider, { callbackUrl: '/account' })
  }

  const oauthMessage = oauthError ? OAUTH_ERROR_MESSAGES[oauthError] ?? 'ログインに失敗しました。' : ''

  async function handleResend() {
    setResending(true)
    setError('')
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok && res.status !== 401) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '再送に失敗しました')
        return
      }
      setResent(true)
    } finally {
      setResending(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(232,224,208,0.06)',
    border: '1px solid var(--faint)',
    borderRadius: '6px',
    padding: '12px 16px',
    color: 'var(--cream)',
    fontSize: '14px',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    width: '100%',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        padding: '48px 40px',
        background: 'var(--bg2)',
        border: '1px solid var(--faint)',
        borderRadius: '12px',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '24px',
          fontWeight: 300,
          color: 'var(--cream)',
          letterSpacing: '0.14em',
          textAlign: 'center',
          marginBottom: '8px',
        }}>
          Sikō Coffee
        </h1>
        <p style={{
          fontSize: '12px',
          color: 'var(--dim)',
          textAlign: 'center',
          letterSpacing: '0.10em',
          marginBottom: '40px',
        }}>
          {awaitingVerification ? 'メールアドレスの確認' : mode === 'login' ? 'ログイン' : '新規登録'}
        </p>

        {awaitingVerification ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              {mode === 'register'
                ? '確認メールを送信しました。メール内のリンクから認証を完了してからログインしてください。'
                : 'メールアドレスが未確認です。確認メールのリンクから認証を完了してください。'}
            </p>

            {resent ? (
              <p style={{ fontSize: '13px', color: 'var(--amber)', textAlign: 'center', margin: 0 }}>
                確認メールを再送しました。
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--amber)',
                  borderRadius: '6px',
                  padding: '12px',
                  color: 'var(--amber)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.10em',
                  cursor: resending ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {resending ? '送信中...' : '確認メールを再送'}
              </button>
            )}

            {error && (
              <p style={{ fontSize: '13px', color: '#e05555', textAlign: 'center', margin: 0 }}>
                {error}
              </p>
            )}

            <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              <Link href="/login" style={{ color: 'var(--amber)', textDecoration: 'none' }}>ログインへ戻る</Link>
            </p>
          </div>
        ) : (
          <>
            {oauthMessage && (
              <p style={{
                fontSize: '13px',
                color: '#e05555',
                textAlign: 'center',
                lineHeight: 1.7,
                margin: '0 0 20px',
              }}>
                {oauthMessage}
              </p>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {mode === 'register' && (
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="お名前（任意）"
                  style={inputStyle}
                />
              )}

              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="メールアドレス"
                required
                autoFocus
                style={inputStyle}
              />

              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="パスワード（8〜72文字）"
                required
                minLength={8}
                maxLength={72}
                style={inputStyle}
              />

              {error && (
                <p style={{ fontSize: '13px', color: '#e05555', textAlign: 'center', margin: 0 }}>
                  {error}
                </p>
              )}

              {mode === 'login' && (
                <p style={{ fontSize: '12px', textAlign: 'right', margin: '-4px 0 0' }}>
                  <Link href="/forgot-password" style={{ color: 'var(--dim)', textDecoration: 'none' }}>
                    パスワードをお忘れですか？
                  </Link>
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  background: loading ? 'transparent' : 'var(--amber)',
                  border: `1px solid var(--amber)`,
                  borderRadius: '6px',
                  padding: '12px',
                  color: loading ? 'var(--dim)' : 'var(--bg)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.10em',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                  fontWeight: 500,
                }}
              >
                {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' }}>
              <span style={{ flex: 1, height: '1px', background: 'var(--faint)' }} />
              <span style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.10em' }}>または</span>
              <span style={{ flex: 1, height: '1px', background: 'var(--faint)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  background: 'transparent',
                  border: '1px solid var(--faint)',
                  borderRadius: '6px',
                  padding: '12px',
                  color: 'var(--cream)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                Google で続ける
              </button>

              <button
                type="button"
                onClick={() => handleOAuth('line')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  background: '#06C755',
                  border: '1px solid #06C755',
                  borderRadius: '6px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 5.64 2 10.13c0 4.02 3.55 7.39 8.35 8.03.32.07.77.21.88.49.1.25.07.64.03.89l-.14.85c-.04.25-.2.99.87.54 1.07-.45 5.76-3.39 7.86-5.81C21.28 13.6 22 11.95 22 10.13 22 5.64 17.52 2 12 2zM8.13 12.6H6.15a.52.52 0 0 1-.52-.52V8.12a.52.52 0 0 1 1.04 0v3.44h1.46a.52.52 0 0 1 0 1.04zm2.04-.52a.52.52 0 0 1-1.04 0V8.12a.52.52 0 0 1 1.04 0v3.96zm4.77 0a.52.52 0 0 1-.36.5.53.53 0 0 1-.58-.19l-2.03-2.76v2.45a.52.52 0 0 1-1.04 0V8.12a.52.52 0 0 1 .94-.31l2.03 2.76V8.12a.52.52 0 0 1 1.04 0v3.96zm3.3-2.5a.52.52 0 0 1 0 1.04h-1.46v.94h1.46a.52.52 0 0 1 0 1.04h-1.98a.52.52 0 0 1-.52-.52V8.12a.52.52 0 0 1 .52-.52h1.98a.52.52 0 0 1 0 1.04h-1.46v.94h1.46z" />
                </svg>
                LINE で続ける
              </button>
            </div>

            <p style={{
              fontSize: '12px',
              color: 'var(--dim)',
              textAlign: 'center',
              marginTop: '24px',
            }}>
              {mode === 'login' ? (
                <>アカウントをお持ちでない方は <Link href="/register" style={{ color: 'var(--amber)', textDecoration: 'none' }}>新規登録</Link></>
              ) : (
                <>アカウントをお持ちの方は <Link href="/login" style={{ color: 'var(--amber)', textDecoration: 'none' }}>ログイン</Link></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
