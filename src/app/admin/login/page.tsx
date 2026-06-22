'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { startAuthentication } from '@simplewebauthn/browser'

type Step = 'password' | 'totp'

export default function AdminLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  useEffect(() => {
    // ブラウザの WebAuthn 対応可否を一度だけ検出する（クライアント機能検出）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasskeySupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)
  }, [])

  async function handlePasskeyLogin() {
    setError('')
    setPasskeyLoading(true)
    try {
      const optRes = await fetch('/api/admin/passkey/login')
      if (!optRes.ok) {
        setPasskeyLoading(false)
        setError(optRes.status === 404 ? 'パスキーが登録されていません' : 'パスキーの取得に失敗しました')
        return
      }
      const options = await optRes.json()
      const authResponse = await startAuthentication(options)

      const verifyRes = await fetch('/api/admin/passkey/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResponse }),
      })
      setPasskeyLoading(false)

      if (verifyRes.ok) {
        router.push('/admin/dashboard')
        return
      }
      const data = await verifyRes.json().catch(() => ({}))
      setError(data.error ?? 'パスキー認証に失敗しました')
    } catch {
      // ユーザーがキャンセルした場合など
      setPasskeyLoading(false)
      setError('パスキー認証がキャンセルされました')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const body = step === 'totp'
      ? { password, totpCode }
      : { password }

    let res: Response
    try {
      res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      setLoading(false)
      setError('ネットワークエラーが発生しました')
      return
    }

    setLoading(false)

    if (res.status === 429) {
      const data = await res.json()
      setError(data.error ?? 'しばらく待ってから再試行してください')
      return
    }

    if (res.ok) {
      const data = await res.json()
      if (data.requireTotp) {
        setStep('totp')
        setTotpCode('')
        return
      }
      router.push('/admin/dashboard')
      return
    }

    const data = await res.json().catch(() => ({}))
    setError(data.error ?? 'エラーが発生しました')
    if (step === 'totp') setTotpCode('')
    else setPassword('')
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--admin-sidebar-bg)',
    border: '1px solid var(--admin-border)',
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
          {step === 'totp' ? '認証コード' : '管理画面'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {step === 'password' ? (
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="パスワード"
              required
              autoFocus
              style={inputStyle}
            />
          ) : (
            <>
              <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
                認証アプリの6桁のコードを入力してください
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                required
                autoFocus
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontSize: '20px' }}
              />
              <button
                type="button"
                onClick={() => { setStep('password'); setError(''); setTotpCode('') }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--dim)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  padding: 0,
                }}
              >
                ← パスワード入力に戻る
              </button>
            </>
          )}

          {error && (
            <p style={{ fontSize: '13px', color: 'var(--admin-danger)', textAlign: 'center', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || (step === 'password' ? !password : totpCode.length !== 6)}
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
            {loading ? '確認中...' : step === 'totp' ? '認証' : 'ログイン'}
          </button>

          {step === 'password' && passkeySupported && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
                <span style={{ flex: 1, height: '1px', background: 'var(--admin-border)' }} />
                <span style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em' }}>または</span>
                <span style={{ flex: 1, height: '1px', background: 'var(--admin-border)' }} />
              </div>
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--admin-border)',
                  borderRadius: '6px',
                  padding: '12px',
                  color: 'var(--cream)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.10em',
                  cursor: passkeyLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {passkeyLoading ? '認証中...' : '🔑 パスキーでログイン'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
