'use client'

import { useState } from 'react'

type SetupState = 'idle' | 'loading' | 'scan' | 'verify' | 'done'

export default function AdminSettingsPage() {
  const [state, setState] = useState<SetupState>('idle')
  const [secret, setSecret] = useState('')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [confirmedSecret, setConfirmedSecret] = useState('')
  const [error, setError] = useState('')

  const totpConfigured = !!process.env.NEXT_PUBLIC_TOTP_ENABLED

  async function startSetup() {
    setState('loading')
    setError('')
    const res = await fetch('/api/admin/totp')
    if (!res.ok) { setState('idle'); setError('エラーが発生しました'); return }
    const data = await res.json()
    setSecret(data.secret)
    setQrCodeDataUrl(data.qrCodeDataUrl)
    setState('scan')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setState('verify')
    const res = await fetch('/api/admin/totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, code }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'コードが違います')
      setState('scan')
      setCode('')
      return
    }
    setConfirmedSecret(secret)
    setState('done')
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--admin-card-bg)',
    border: '1px solid var(--admin-border)',
    borderRadius: '10px',
    padding: '32px',
    maxWidth: '480px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    letterSpacing: '0.12em',
    color: 'var(--dim)',
    textTransform: 'uppercase',
    marginBottom: '8px',
  }

  return (
    <div>
      <h1 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '22px',
        fontWeight: 300,
        color: 'var(--cream)',
        letterSpacing: '0.10em',
        marginBottom: '32px',
      }}>
        セキュリティ設定
      </h1>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '14px', color: 'var(--cream)', letterSpacing: '0.08em', marginBottom: '8px' }}>
          二段階認証 (TOTP)
        </h2>

        {state === 'idle' && (
          <>
            <p style={{ fontSize: '13px', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '24px' }}>
              Google Authenticator などの認証アプリを使った二段階認証を設定できます。
              設定後は ADMIN_TOTP_SECRET 環境変数を Vercel に追加してください。
            </p>
            <button onClick={startSetup} style={btnStyle}>
              セットアップを開始
            </button>
          </>
        )}

        {state === 'loading' && (
          <p style={{ fontSize: '13px', color: 'var(--dim)' }}>生成中...</p>
        )}

        {state === 'scan' && (
          <>
            <p style={{ ...labelStyle, marginTop: 0 }}>1. QRコードをスキャン</p>
            {qrCodeDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrCodeDataUrl} alt="TOTP QR Code" style={{ width: 200, height: 200, display: 'block', marginBottom: '20px', borderRadius: '8px' }} />
            )}
            <p style={labelStyle}>2. または手動でシークレットを入力</p>
            <code style={{
              display: 'block',
              background: 'var(--admin-sidebar-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '13px',
              color: 'var(--cream)',
              letterSpacing: '0.08em',
              wordBreak: 'break-all',
              marginBottom: '24px',
              userSelect: 'all',
            }}>
              {secret}
            </code>

            <p style={labelStyle}>3. 認証アプリのコードを入力して確認</p>
            <form onSubmit={verifyCode} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                required
                autoFocus
                style={{
                  background: 'var(--admin-sidebar-bg)',
                  border: '1px solid var(--admin-border)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  color: 'var(--cream)',
                  fontSize: '18px',
                  letterSpacing: '0.3em',
                  outline: 'none',
                  width: '140px',
                  textAlign: 'center',
                }}
              />
              <button type="submit" disabled={code.length !== 6} style={btnStyle}>
                確認
              </button>
            </form>
            {error && (
              <p style={{ fontSize: '13px', color: 'var(--admin-danger)', marginTop: '12px' }}>{error}</p>
            )}
          </>
        )}

        {state === 'done' && (
          <>
            <p style={{ fontSize: '13px', color: '#4caf50', marginBottom: '20px' }}>
              ✓ 認証コードの確認が完了しました
            </p>
            <p style={labelStyle}>Vercel に以下の環境変数を追加してください</p>
            <div style={{
              background: 'var(--admin-sidebar-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: '6px',
              padding: '14px',
              fontSize: '13px',
              color: 'var(--cream)',
              marginBottom: '8px',
            }}>
              <span style={{ color: 'var(--dim)' }}>ADMIN_TOTP_SECRET=</span>
              <span style={{ userSelect: 'all' }}>{confirmedSecret}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--admin-danger)', marginTop: '8px' }}>
              このシークレットは安全な場所に保管し、第三者と共有しないでください。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'var(--admin-accent)',
  border: '1px solid var(--admin-accent)',
  borderRadius: '6px',
  padding: '10px 20px',
  color: '#0d0d14',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
  letterSpacing: '0.08em',
  cursor: 'pointer',
}
