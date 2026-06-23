'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: '360px',
  padding: '48px 40px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
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

function ResetPasswordContent() {
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '再設定に失敗しました')
        return
      }
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={card}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 300, color: 'var(--cream)', letterSpacing: '0.14em', textAlign: 'center', marginBottom: '8px' }}>
          Sikō Coffee
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', letterSpacing: '0.10em', marginBottom: '40px' }}>
          新しいパスワードの設定
        </p>

        {!token ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              リンクが無効です。お手数ですが、再度パスワード再設定をリクエストしてください。
            </p>
            <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              <Link href="/forgot-password" style={{ color: 'var(--amber)', textDecoration: 'none' }}>再設定をやり直す</Link>
            </p>
          </div>
        ) : done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              パスワードを再設定しました。新しいパスワードでログインしてください。
            </p>
            <Link
              href="/login"
              style={{ display: 'inline-block', background: 'var(--amber)', color: 'var(--bg)', textDecoration: 'none', padding: '12px 32px', borderRadius: '6px', fontSize: '13px', letterSpacing: '0.08em', textAlign: 'center' }}
            >
              ログイン
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="新しいパスワード（8〜72文字）"
              required
              minLength={8}
              maxLength={72}
              autoFocus
              style={inputStyle}
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="新しいパスワード（確認）"
              required
              minLength={8}
              maxLength={72}
              style={inputStyle}
            />
            {error && <p style={{ fontSize: '13px', color: '#e05555', textAlign: 'center', margin: 0 }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'transparent' : 'var(--amber)',
                border: '1px solid var(--amber)',
                borderRadius: '6px',
                padding: '12px',
                color: loading ? 'var(--dim)' : 'var(--bg)',
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.10em',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              {loading ? '設定中...' : 'パスワードを再設定'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  )
}
