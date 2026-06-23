'use client'

import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  mode: 'login' | 'register'
}

export default function AuthForm({ mode }: Props) {
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
