'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'

interface Props {
  user: { name?: string | null; email?: string | null }
}

export default function AccountClient({ user }: Props) {
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
        maxWidth: '400px',
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
          マイページ
        </h1>
        <p style={{
          fontSize: '12px',
          color: 'var(--dim)',
          textAlign: 'center',
          letterSpacing: '0.06em',
          marginBottom: '40px',
        }}>
          {user.email}
        </p>

        <div style={{
          padding: '20px',
          background: 'rgba(232,224,208,0.04)',
          borderRadius: '8px',
          border: '1px solid var(--faint)',
          marginBottom: '24px',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--dim)', margin: 0 }}>
            {user.name ? `${user.name} さん、ようこそ。` : 'ようこそ。'}
          </p>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid var(--faint)',
            borderRadius: '6px',
            padding: '12px',
            color: 'var(--dim)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.10em',
            cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--amber)'
            e.currentTarget.style.color = 'var(--cream)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--faint)'
            e.currentTarget.style.color = 'var(--dim)'
          }}
        >
          ログアウト
        </button>

        <p style={{
          fontSize: '12px',
          color: 'var(--dim)',
          textAlign: 'center',
          marginTop: '24px',
        }}>
          <Link href="/" style={{ color: 'var(--amber)', textDecoration: 'none' }}>← トップに戻る</Link>
        </p>
      </div>
    </div>
  )
}
