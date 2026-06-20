'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { PRESET_AVATARS, getPresetSvg } from '@/lib/avatars'

interface OrderItem {
  name: string
  grams?: number
  grind?: string
  custom?: boolean
  single?: boolean
}

interface Order {
  id: string
  status: string
  amount?: number | null
  createdAt: string
  paidAt?: string
  items: OrderItem[]
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
}

const STATUS_LABEL: Record<string, string> = {
  paid: '支払い完了',
  processing: '準備中',
  shipped: '発送済み',
  delivered: '配達完了',
  cancelled: 'キャンセル',
  refunded: '返金済み',
}

interface Props {
  user: { name?: string | null; email?: string | null }
  emailVerified: boolean
  initialAvatarPreset?: string | null
  initialAvatarUrl?: string | null
}

function AvatarDisplay({ presetId, url, size = 64 }: { presetId?: string | null; url?: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt="アバター"
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      />
    )
  }
  const svg = presetId ? getPresetSvg(presetId) : null
  if (svg) {
    return (
      <span
        style={{ display: 'block', width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }
  return (
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(200,164,90,0.15)', color: 'var(--amber)', fontSize: size * 0.4,
      fontFamily: 'var(--font-serif)',
    }}>
      ?
    </span>
  )
}

export default function AccountClient({ user, emailVerified, initialAvatarPreset, initialAvatarUrl }: Props) {
  const [resending, setResending] = useState(false)
  const [resendResult, setResendResult] = useState<'sent' | 'error' | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)

  const [avatarPreset, setAvatarPreset] = useState(initialAvatarPreset ?? null)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? null)
  const [avatarEditing, setAvatarEditing] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/account/orders')
      .then(r => r.json())
      .then(data => setOrders(data.orders ?? []))
      .catch(() => {})
      .finally(() => setOrdersLoading(false))
  }, [])

  // サーバーから最新のアバター情報を取得
  useEffect(() => {
    fetch('/api/account/avatar')
      .then(r => r.json())
      .then(data => {
        if (data.avatarPreset !== undefined) setAvatarPreset(data.avatarPreset)
        if (data.avatarUrl !== undefined) setAvatarUrl(data.avatarUrl)
      })
      .catch(() => {})
  }, [])

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

  async function selectPreset(presetId: string) {
    setAvatarSaving(true)
    setAvatarError(null)
    try {
      const res = await fetch('/api/account/avatar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      })
      if (res.status === 429) {
        setRateLimited(true)
        setAvatarError('アイコンの変更は1日1回までです')
        return
      }
      if (!res.ok) {
        const data = await res.json()
        setAvatarError(data.error ?? '保存に失敗しました')
        return
      }
      const data = await res.json()
      setAvatarPreset(data.avatarPreset)
      setAvatarUrl(data.avatarUrl)
      setAvatarEditing(false)
    } catch {
      setAvatarError('保存に失敗しました')
    } finally {
      setAvatarSaving(false)
    }
  }

  async function handleUpload(file: File) {
    setAvatarSaving(true)
    setAvatarError(null)
    const form = new FormData()
    form.append('avatar', file)
    try {
      const res = await fetch('/api/account/avatar', { method: 'PUT', body: form })
      if (res.status === 429) {
        setRateLimited(true)
        setAvatarError('アイコンの変更は1日1回までです')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setAvatarError(data.error ?? 'アップロードに失敗しました')
        return
      }
      setAvatarPreset(data.avatarPreset)
      setAvatarUrl(data.avatarUrl)
      setAvatarEditing(false)
    } catch {
      setAvatarError('アップロードに失敗しました')
    } finally {
      setAvatarSaving(false)
    }
  }

  const cardStyle = {
    width: '100%',
    maxWidth: '400px',
    padding: '40px',
    background: 'var(--bg2)',
    border: '1px solid var(--faint)',
    borderRadius: '12px',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      padding: '24px',
      paddingTop: '80px',
    }}>
      {/* プロフィールカード */}
      <div style={{ ...cardStyle, padding: '48px 40px' }}>
        {/* アバター */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
          <button
            onClick={() => setAvatarEditing(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              position: 'relative',
            }}
            title="アイコンを変更"
          >
            <AvatarDisplay presetId={avatarPreset} url={avatarUrl} size={72} />
            <span style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--bg2)', border: '1px solid var(--faint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', color: 'var(--dim)',
            }}>✎</span>
          </button>
        </div>

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

        {/* アバター編集パネル */}
        {avatarEditing && (
          <div style={{
            padding: '20px',
            background: 'rgba(232,224,208,0.04)',
            borderRadius: '8px',
            border: '1px solid var(--faint)',
            marginBottom: '24px',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--cream)', margin: '0 0 14px', letterSpacing: '0.06em' }}>
              アイコンを選択
            </p>

            {avatarError && (
              <p style={{ fontSize: '12px', color: '#e57373', margin: '0 0 12px' }}>{avatarError}</p>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px',
              marginBottom: '16px',
            }}>
              {PRESET_AVATARS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => selectPreset(preset.id)}
                  disabled={avatarSaving || rateLimited}
                  title={preset.label}
                  style={{
                    background: 'none',
                    border: avatarPreset === preset.id && !avatarUrl
                      ? '2px solid var(--amber)'
                      : '2px solid transparent',
                    borderRadius: '50%',
                    cursor: avatarSaving || rateLimited ? 'not-allowed' : 'pointer',
                    padding: '3px',
                    opacity: avatarSaving ? 0.5 : 1,
                    transition: 'border-color 0.2s',
                  }}
                >
                  <AvatarDisplay presetId={preset.id} size={44} />
                </button>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--faint)', paddingTop: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 10px', letterSpacing: '0.06em' }}>
                または画像をアップロード（JPEG・PNG・WebP、2MB以下）
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f)
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarSaving || rateLimited}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--faint)',
                  borderRadius: '6px',
                  padding: '8px 20px',
                  color: 'var(--dim)',
                  fontSize: '12px',
                  cursor: avatarSaving || rateLimited ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.06em',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
              >
                {avatarSaving ? '処理中...' : '画像を選択'}
              </button>
            </div>

            <p style={{ fontSize: '10px', color: 'var(--dim)', marginTop: '12px', opacity: 0.6 }}>
              ※ アイコンの変更は1日1回までです
            </p>
          </div>
        )}

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

      {/* 注文履歴 */}
      <div style={{ ...cardStyle, marginTop: '24px' }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '18px',
          fontWeight: 300,
          color: 'var(--cream)',
          letterSpacing: '0.12em',
          marginBottom: '24px',
        }}>
          注文履歴
        </h2>

        {ordersLoading ? (
          <p style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>
            読み込み中...
          </p>
        ) : orders.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--dim)' }}>
            まだ注文がありません。
            <Link href="/shop" style={{ color: 'var(--amber)', textDecoration: 'none', marginLeft: '8px' }}>
              ショップへ →
            </Link>
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {orders.map(order => (
              <div key={order.id} style={{
                padding: '16px 20px',
                background: 'rgba(232,224,208,0.04)',
                borderRadius: '8px',
                border: '1px solid var(--faint)',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}>
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--dim)',
                    letterSpacing: '0.06em',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}>
                    {new Date(order.paidAt ?? order.createdAt).toLocaleDateString('ja-JP')}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: order.status === 'delivered' ? 'var(--amber)' : 'var(--dim)',
                    letterSpacing: '0.08em',
                    padding: '2px 8px',
                    border: `1px solid ${order.status === 'delivered' ? 'rgba(200,164,90,0.3)' : 'var(--faint)'}`,
                    borderRadius: '4px',
                  }}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  {order.items.map((it, i) => {
                    const tag = it.single ? 'シングル' : it.custom ? 'オリジナル' : 'ブレンド'
                    return (
                      <p key={i} style={{
                        fontSize: '13px',
                        color: 'var(--cream)',
                        margin: '0 0 2px',
                        letterSpacing: '0.04em',
                      }}>
                        {it.name}
                        <span style={{ fontSize: '11px', color: 'var(--dim)', marginLeft: '6px' }}>
                          {tag} / {it.grind ?? '豆のまま'} / {it.grams ?? 200}g
                        </span>
                      </p>
                    )
                  })}
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  {typeof order.amount === 'number' && (
                    <span style={{
                      fontSize: '14px',
                      color: 'var(--cream)',
                      fontFamily: 'var(--font-serif)',
                      letterSpacing: '0.04em',
                    }}>
                      ¥{order.amount.toLocaleString()}
                    </span>
                  )}
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '11px',
                        color: 'var(--amber)',
                        textDecoration: 'none',
                        letterSpacing: '0.06em',
                      }}
                    >
                      配送を追跡 →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export { AvatarDisplay }
