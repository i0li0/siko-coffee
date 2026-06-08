'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setLoading(false)

    if (res.ok) {
      router.push('/admin/dashboard')
    } else {
      setError('パスワードが違います')
      setPassword('')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        padding: '48px 40px',
        background: 'var(--admin-card-bg)',
        border: '1px solid var(--admin-border)',
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
          管理画面
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="パスワード"
            required
            autoFocus
            style={{
              background: 'var(--admin-sidebar-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: '6px',
              padding: '12px 16px',
              color: 'var(--cream)',
              fontSize: '14px',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
              width: '100%',
            }}
          />

          {error && (
            <p style={{ fontSize: '13px', color: 'var(--admin-danger)', textAlign: 'center' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              background: loading ? 'transparent' : 'var(--admin-accent)',
              border: '1px solid var(--admin-accent)',
              borderRadius: '6px',
              padding: '12px',
              color: loading ? 'var(--dim)' : '#0d0d14',
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.10em',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? '確認中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
