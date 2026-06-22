'use client'

import { useState, useEffect } from 'react'
import { startRegistration } from '@simplewebauthn/browser'

type SetupState = 'loading' | 'idle' | 'scan' | 'verifying' | 'done'

interface Passkey {
  id: string
  label: string
  createdAt: number
  lastUsedAt: number | null
}

export default function AdminSettingsPage() {
  const [state, setState] = useState<SetupState>('loading')
  const [enabled, setEnabled] = useState(false)
  const [secret, setSecret] = useState('')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [disabling, setDisabling] = useState(false)

  // ===== パスキー (WebAuthn) =====
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [passkeyError, setPasskeyError] = useState('')

  useEffect(() => {
    fetch('/api/admin/totp')
      .then(r => r.json())
      .then(data => {
        setEnabled(data.enabled)
        setState('idle')
      })
      .catch(() => setState('idle'))
  }, [])

  useEffect(() => {
    // ブラウザの WebAuthn 対応可否を一度だけ検出する（クライアント機能検出）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasskeySupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)
    loadPasskeys()
  }, [])

  async function loadPasskeys() {
    try {
      const res = await fetch('/api/admin/passkey')
      if (res.ok) {
        const data = await res.json()
        setPasskeys(data.passkeys ?? [])
      }
    } catch {
      // 一覧取得失敗は致命的でないため無視
    }
  }

  async function registerPasskey() {
    setPasskeyError('')
    setRegistering(true)
    try {
      const optRes = await fetch('/api/admin/passkey/register')
      if (!optRes.ok) {
        setRegistering(false)
        setPasskeyError('登録の準備に失敗しました')
        return
      }
      const options = await optRes.json()
      const attResponse = await startRegistration(options)

      const label = window.prompt('このパスキーの名前（端末名など）', 'パスキー') ?? 'パスキー'

      const verifyRes = await fetch('/api/admin/passkey/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attResponse, label }),
      })
      setRegistering(false)
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}))
        setPasskeyError(data.error ?? 'パスキーの登録に失敗しました')
        return
      }
      await loadPasskeys()
    } catch {
      setRegistering(false)
      setPasskeyError('パスキーの登録がキャンセルされました')
    }
  }

  async function deletePasskey(id: string) {
    if (!confirm('このパスキーを削除しますか？')) return
    const res = await fetch(`/api/admin/passkey?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) await loadPasskeys()
  }

  async function startSetup() {
    setState('loading')
    setError('')
    const res = await fetch('/api/admin/totp')
    if (!res.ok) { setState('idle'); setError('エラーが発生しました'); return }
    const data = await res.json()
    setEnabled(data.enabled)
    setSecret(data.secret)
    setQrCodeDataUrl(data.qrCodeDataUrl)
    setState('scan')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setState('verifying')
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
    setEnabled(true)
    setState('done')
  }

  async function disableTotp() {
    if (!confirm('二段階認証を無効にしますか？')) return
    setDisabling(true)
    const res = await fetch('/api/admin/totp', { method: 'DELETE' })
    setDisabling(false)
    if (res.ok) {
      setEnabled(false)
      setState('idle')
      setSecret('')
      setQrCodeDataUrl('')
      setCode('')
    }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '14px', color: 'var(--cream)', letterSpacing: '0.08em', margin: 0 }}>
            二段階認証 (TOTP)
          </h2>
          {enabled && (
            <span style={{ fontSize: '11px', color: '#4caf50', letterSpacing: '0.08em' }}>有効</span>
          )}
        </div>

        {state === 'loading' && (
          <p style={{ fontSize: '13px', color: 'var(--dim)' }}>読み込み中...</p>
        )}

        {state === 'idle' && !enabled && (
          <>
            <p style={{ fontSize: '13px', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '24px' }}>
              Google Authenticator などの認証アプリを使った二段階認証を設定できます。
            </p>
            <button onClick={startSetup} style={btnStyle}>
              セットアップを開始
            </button>
            {error && (
              <p style={{ fontSize: '13px', color: 'var(--admin-danger)', marginTop: '12px' }}>{error}</p>
            )}
          </>
        )}

        {state === 'idle' && enabled && (
          <>
            <p style={{ fontSize: '13px', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '24px' }}>
              二段階認証は有効です。新しい認証アプリに切り替える場合は再設定できます。
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={startSetup} style={btnStyle}>
                再設定
              </button>
              <button onClick={disableTotp} disabled={disabling} style={dangerBtnStyle}>
                {disabling ? '無効化中...' : '無効化'}
              </button>
            </div>
          </>
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

        {state === 'verifying' && (
          <p style={{ fontSize: '13px', color: 'var(--dim)' }}>確認中...</p>
        )}

        {state === 'done' && (
          <>
            <p style={{ fontSize: '13px', color: '#4caf50', marginBottom: '20px' }}>
              二段階認証が有効になりました。次回ログインから認証コードが必要です。
            </p>
            <button onClick={() => setState('idle')} style={btnStyle}>
              戻る
            </button>
          </>
        )}
      </div>

      <div style={{ ...cardStyle, marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '14px', color: 'var(--cream)', letterSpacing: '0.08em', margin: 0 }}>
            パスキー (WebAuthn)
          </h2>
          {passkeys.length > 0 && (
            <span style={{ fontSize: '11px', color: '#4caf50', letterSpacing: '0.08em' }}>
              {passkeys.length}件 登録済み
            </span>
          )}
        </div>

        <p style={{ fontSize: '13px', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '24px' }}>
          指紋・顔認証・端末のロック解除でログインできます。フィッシング耐性が高く、パスワードや認証コードなしでログインできます。
        </p>

        {!passkeySupported && (
          <p style={{ fontSize: '13px', color: 'var(--admin-danger)', marginBottom: '16px' }}>
            このブラウザはパスキーに対応していません。
          </p>
        )}

        {passkeys.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
            {passkeys.map(pk => (
              <li
                key={pk.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--admin-border)',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--cream)' }}>🔑 {pk.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                    {new Date(pk.createdAt).toLocaleDateString('ja-JP')} 登録
                    {' ・ '}
                    {pk.lastUsedAt
                      ? `最終使用 ${new Date(pk.lastUsedAt).toLocaleDateString('ja-JP')}`
                      : '未使用'}
                  </div>
                </div>
                <button
                  onClick={() => deletePasskey(pk.id)}
                  style={{ ...dangerBtnStyle, padding: '6px 14px', fontSize: '12px' }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}

        {passkeySupported && (
          <button onClick={registerPasskey} disabled={registering} style={btnStyle}>
            {registering ? '登録中...' : 'パスキーを登録'}
          </button>
        )}

        {passkeyError && (
          <p style={{ fontSize: '13px', color: 'var(--admin-danger)', marginTop: '12px' }}>{passkeyError}</p>
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

const dangerBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--admin-danger)',
  borderRadius: '6px',
  padding: '10px 20px',
  color: 'var(--admin-danger)',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
  letterSpacing: '0.08em',
  cursor: 'pointer',
}
