'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import type { PoRecord, PoStatus } from '@/types/platform'

const STATUS_LABEL: Record<PoStatus, string> = {
  auto_approved: '自動承認',
  pending: '要対応',
  accepted: '承認済み',
  declined: '辞退',
  timeout: '期限切れ',
}

function fmtQty(g: number): string {
  return g >= 1000 ? `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}kg` : `${g.toLocaleString()}g`
}

// timeoutAt までの残り。過ぎていれば null（期限切れ扱い）。
function remaining(timeoutAt?: string): string | null {
  if (!timeoutAt) return null
  const ms = new Date(timeoutAt).getTime() - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h >= 1 ? `残り約${h}時間` : `残り約${m}分`
}

const cardStyle = {
  width: '100%',
  maxWidth: '560px',
  padding: '32px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
} as const

export default function RoasterOrdersClient() {
  const [pos, setPos] = useState<PoRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // orderId#beanId ごとの処理中フラグ・エラー
  const [busy, setBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  // decline 前の確認対象キー
  const [confirming, setConfirming] = useState<string | null>(null)

  // 一覧の取得（.then チェーンで統一＝effect からの同期 setState を避ける）
  function reload() {
    return fetch('/api/roaster/pos')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((data) => setPos(data.pos ?? []))
      .catch(() => setError('発注の取得に失敗しました'))
  }

  useEffect(() => {
    fetch('/api/roaster/pos')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((data) => setPos(data.pos ?? []))
      .catch(() => setError('発注の取得に失敗しました'))
  }, [])

  async function respond(po: PoRecord, decision: 'accept' | 'decline') {
    const key = po.poKey
    setBusy(key)
    setRowError((e) => ({ ...e, [key]: '' }))
    try {
      const res = await fetch(`/api/roaster/pos/${encodeURIComponent(po.orderId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beanId: po.beanId, decision }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((e) => ({ ...e, [key]: data.error ?? '応答に失敗しました' }))
        // 409（既に応答/期限切れ）は一覧を再取得して整合を取る
        if (res.status === 409) reload()
        return
      }
      // 応答済みで置き換え
      setPos((prev) => (prev ? prev.map((p) => (p.poKey === key ? { ...p, ...data } : p)) : prev))
      setConfirming(null)
    } catch {
      setRowError((e) => ({ ...e, [key]: '応答に失敗しました' }))
    } finally {
      setBusy(null)
    }
  }

  const pending = pos?.filter((p) => p.poStatus === 'pending') ?? []
  const history = pos?.filter((p) => p.poStatus !== 'pending') ?? []

  return (
    <>
      <Nav visible logoHref="/" />
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px',
          paddingTop: '140px',
        }}
      >
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '24px',
                fontWeight: 300,
                color: 'var(--cream)',
                letterSpacing: '0.14em',
                margin: 0,
              }}
            >
              発注応答
            </h1>
            <Link href="/roaster" style={{ fontSize: '12px', color: 'var(--dim)', textDecoration: 'none', letterSpacing: '0.06em' }}>
              ← 戻る
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 28px', lineHeight: 1.7 }}>
            あなたの豆がブレンドに使われた注文です。承認すると発注が確定し、辞退すると購入者へ差替または返金を案内します。
          </p>

          {error && <p style={{ fontSize: '13px', color: '#e57373' }}>{error}</p>}

          {pos === null && !error && (
            <p style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>読み込み中...</p>
          )}

          {pos !== null && pending.length === 0 && (
            <div
              style={{
                padding: '20px',
                background: 'rgba(232,224,208,0.04)',
                borderRadius: '8px',
                border: '1px solid var(--faint)',
                marginBottom: history.length > 0 ? '28px' : 0,
              }}
            >
              <p style={{ fontSize: '13px', color: 'var(--dim)', margin: 0 }}>要対応の発注はありません。</p>
            </div>
          )}

          {/* 要対応 */}
          {pending.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: history.length > 0 ? '28px' : 0 }}>
              {pending.map((po) => {
                const rem = remaining(po.timeoutAt)
                return (
                  <div
                    key={po.poKey}
                    style={{
                      padding: '18px 20px',
                      background: 'rgba(212,160,23,0.06)',
                      borderRadius: '8px',
                      border: '1px solid rgba(212,160,23,0.28)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <span style={{ fontSize: '15px', color: 'var(--cream)', letterSpacing: '0.04em' }}>{po.beanName}</span>
                      <span style={{ fontSize: '14px', color: 'var(--amber)', fontFamily: 'var(--font-serif)' }}>{fmtQty(po.qtyG)}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--dim)', margin: '0 0 14px', fontFamily: 'var(--font-mono)' }}>
                      注文 {po.orderId.slice(0, 8)}
                      {rem ? ` ・ ${rem}` : po.timeoutAt ? ' ・ 期限超過' : ''}
                    </p>

                    {rowError[po.poKey] && (
                      <p style={{ fontSize: '12px', color: '#e57373', margin: '0 0 10px' }}>{rowError[po.poKey]}</p>
                    )}

                    {confirming === po.poKey ? (
                      <div>
                        <p style={{ fontSize: '12px', color: 'var(--cream)', margin: '0 0 10px', lineHeight: 1.6 }}>
                          辞退すると購入者へ差替（別の豆）または返金を案内します。よろしいですか？
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <ActionButton onClick={() => respond(po, 'decline')} disabled={busy === po.poKey} tone="danger">
                            {busy === po.poKey ? '処理中...' : '辞退を確定'}
                          </ActionButton>
                          <ActionButton onClick={() => setConfirming(null)} disabled={busy === po.poKey} tone="ghost">
                            戻る
                          </ActionButton>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <ActionButton onClick={() => respond(po, 'accept')} disabled={busy === po.poKey} tone="primary">
                          {busy === po.poKey ? '処理中...' : '承認'}
                        </ActionButton>
                        <ActionButton onClick={() => setConfirming(po.poKey)} disabled={busy === po.poKey} tone="ghost">
                          辞退
                        </ActionButton>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 履歴 */}
          {history.length > 0 && (
            <div>
              <h2 style={{ fontSize: '13px', color: 'var(--dim)', letterSpacing: '0.1em', margin: '0 0 14px', fontWeight: 400 }}>
                履歴
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map((po) => (
                  <div
                    key={po.poKey}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: 'rgba(232,224,208,0.04)',
                      borderRadius: '8px',
                      border: '1px solid var(--faint)',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: '13px', color: 'var(--cream)', margin: '0 0 2px' }}>{po.beanName}</p>
                      <p style={{ fontSize: '11px', color: 'var(--dim)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                        {fmtQty(po.qtyG)} ・ 注文 {po.orderId.slice(0, 8)}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        color: po.poStatus === 'declined' || po.poStatus === 'timeout' ? 'var(--dim)' : 'var(--amber)',
                        letterSpacing: '0.06em',
                        padding: '2px 8px',
                        border: `1px solid ${po.poStatus === 'declined' || po.poStatus === 'timeout' ? 'var(--faint)' : 'rgba(212,160,23,0.3)'}`,
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {STATUS_LABEL[po.poStatus]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone: 'primary' | 'ghost' | 'danger'
}) {
  const palette =
    tone === 'primary'
      ? { border: 'var(--amber)', color: 'var(--amber)' }
      : tone === 'danger'
        ? { border: '#e57373', color: '#e57373' }
        : { border: 'var(--faint)', color: 'var(--dim)' }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: tone === 'ghost' ? '0 0 auto' : 1,
        background: 'transparent',
        border: `1px solid ${palette.border}`,
        borderRadius: '6px',
        padding: '10px 20px',
        color: palette.color,
        fontSize: '13px',
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.08em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {children}
    </button>
  )
}
