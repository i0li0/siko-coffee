'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { useState } from 'react'

interface Props {
  user: { name?: string | null; email?: string | null }
  emailVerified: boolean
}

export default function AccountClient({ user, emailVerified }: Props) {
  const [resending, setResending] = useState(false)
  const [resendResult, setResendResult] = useState<'sent' | 'error' | null>(null)

  async function handleResend() {
    setResending(true)
    setResendResult(null)
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      setResendResult(res.ok ? 'sent' : 'error')
    } catch {
      setResendResult('error')
    } finally {
      setResending(false)
    }
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

        {!emailVerified && (
          <div style={{
            padding: '16px 20px',
            background: 'rgba(200,164,90,0.08)',
            borderRadius: '8px',
            border: '1px solid rgba(200,164,90,0.25)',
            marginBottom: '16px',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--amber)', margin: '0 0 8px' }}>
              メールアドレスが未確認です
            </p>
            <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 12px' }}>
              登録時に確認メールを送信しました。届いていない場合は再送できます。
            </p>
            <button
              onClick={handleResend}
              disabled={resending || resendResult === 'sent'}
              style={{
                background: 'transparent',
                border: '1px solid var(--amber)',
                borderRadius: '4px',
                padding: '6px 16px',
                color: 'var(--amber)',
                fontSize: '12px',
                cursor: resending || resendResult === 'sent' ? 'not-allowed' : 'pointer',
                opacity: resending ? 0.5 : 1,
              }}
            >
              {resending ? '送信中...' : resendResult === 'sent' ? '送信しました' : resendResult === 'error' ? '送信失敗 — 再試行' : '確認メールを再送'}
            </button>
          </div>
        )}

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
