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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '登録に失敗しました')
        setLoading(false)
        return
      }
    }

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError(mode === 'register' ? '登録は完了しましたがログインに失敗しました' : 'メールアドレスまたはパスワードが違います')
      return
    }

    router.push('/account')
    router.refresh()
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
          {mode === 'login' ? 'ログイン' : '新規登録'}
        </p>

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
      </div>
    </div>
  )
}
