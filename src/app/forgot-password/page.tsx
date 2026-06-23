'use client'

import Link from 'next/link'
import { useState } from 'react'

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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '送信に失敗しました')
        return
      }
      setSent(true)
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
          パスワードの再設定
        </p>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              ご入力のメールアドレスが登録されている場合、パスワード再設定用のリンクを送信しました。メールをご確認ください。
            </p>
            <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              <Link href="/login" style={{ color: 'var(--amber)', textDecoration: 'none' }}>ログインへ戻る</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--dim)', margin: 0 }}>
              登録済みのメールアドレスを入力してください。再設定用のリンクをお送りします。
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="メールアドレス"
              required
              autoFocus
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
              {loading ? '送信中...' : '再設定リンクを送信'}
            </button>
            <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              <Link href="/login" style={{ color: 'var(--amber)', textDecoration: 'none' }}>ログインへ戻る</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
