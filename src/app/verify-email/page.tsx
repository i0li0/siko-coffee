'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function VerifyEmailContent() {
  const params = useSearchParams()
  const status = params.get('status')
  const success = status === 'success'

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
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '24px',
          fontWeight: 300,
          color: 'var(--cream)',
          letterSpacing: '0.14em',
          marginBottom: '24px',
        }}>
          {success ? 'メール認証完了' : 'メール認証'}
        </h1>

        <p style={{
          fontSize: '14px',
          lineHeight: 1.8,
          color: 'var(--dim)',
          marginBottom: '32px',
        }}>
          {status === 'success'
            ? 'メールアドレスが確認されました。ご利用ありがとうございます。'
            : status === 'rate-limited'
              ? 'リクエストが多すぎます。しばらくしてから再試行してください。'
              : status === 'expired'
                ? '確認リンクの有効期限が切れています。マイページから再送できます。'
                : 'リンクが無効です。マイページから確認メールを再送してください。'}
        </p>

        <Link
          href={success ? '/account' : '/login'}
          style={{
            display: 'inline-block',
            background: 'var(--amber)',
            color: 'var(--bg)',
            textDecoration: 'none',
            padding: '12px 32px',
            borderRadius: '6px',
            fontSize: '13px',
            letterSpacing: '0.08em',
          }}
        >
          {success ? 'マイページへ' : 'ログイン'}
        </Link>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  )
}
