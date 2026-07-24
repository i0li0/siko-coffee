'use client'

import { useEffect, useState } from 'react'
import type { RoasterRecord, RoasterStatus, LicenseType } from '@/types/platform'

const STATUS_TABS: { key: RoasterStatus; label: string }[] = [
  { key: 'pending', label: '承認待ち' },
  { key: 'active', label: '販売中' },
  { key: 'paused', label: '休止' },
  { key: 'selling_out', label: '売り切り' },
  { key: 'withdrawn', label: '退会' },
]

const STATUS_BADGE: Record<RoasterStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '承認待ち', color: '#d9b26a', bg: 'rgba(217,178,106,0.14)' },
  active: { label: '販売中', color: '#7Fd0a8', bg: 'rgba(127,208,168,0.12)' },
  paused: { label: '休止', color: 'var(--dim)', bg: 'rgba(240,235,224,0.06)' },
  selling_out: { label: '売り切り', color: 'var(--admin-accent)', bg: 'rgba(184,190,200,0.10)' },
  withdrawn: { label: '退会', color: 'var(--dim)', bg: 'rgba(240,235,224,0.04)' },
}

const LICENSE_LABEL: Record<LicenseType, string> = {
  notification: '届出',
  permit: '許可',
}

// API 側 TRANSITIONS（src/app/api/admin/roasters/[roasterId]/route.ts）と一致させること。
const ACTIONS: Record<RoasterStatus, { to: RoasterStatus; label: string; danger?: boolean; confirm?: string }[]> = {
  pending: [
    { to: 'active', label: '承認' },
    { to: 'withdrawn', label: '却下', danger: true, confirm: 'この申請を却下しますか？' },
  ],
  active: [
    { to: 'paused', label: '休止にする' },
    { to: 'selling_out', label: '売り切りへ' },
    { to: 'withdrawn', label: '退会', danger: true, confirm: 'この焙煎者を退会にしますか？' },
  ],
  paused: [
    { to: 'active', label: '再開' },
    { to: 'selling_out', label: '売り切りへ' },
    { to: 'withdrawn', label: '退会', danger: true, confirm: 'この焙煎者を退会にしますか？' },
  ],
  selling_out: [{ to: 'withdrawn', label: '退会', danger: true, confirm: '退会にしますか？' }],
  withdrawn: [],
}

const OPT_IN_LABEL: Record<string, string> = {
  allowBlend: 'ブレンド利用可',
  allowNameStory: '名前・ストーリー掲載可',
  allowSelloutAfterExit: '退会後売り切り可',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export default function RoastersAdminPage() {
  const [tab, setTab] = useState<RoasterStatus>('pending')
  const [items, setItems] = useState<RoasterRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/admin/roasters?status=${tab}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((data: RoasterRecord[]) => {
        if (cancelled) return
        setItems(Array.isArray(data) ? data : [])
        setError(null)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('焙煎者の取得に失敗しました')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  async function transition(roasterId: string, to: RoasterStatus, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(roasterId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/roasters/${encodeURIComponent(roasterId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? '更新に失敗しました')
        return
      }
      // 現在のタブから外れるのでリストから除く
      setItems((prev) => prev.filter((r) => r.roasterId !== roasterId))
    } catch {
      setError('更新に失敗しました')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ maxWidth: '880px' }}>
      <div style={{ marginBottom: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>焙煎者管理</h2>
        <p style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '6px', lineHeight: 1.7 }}>
          焙煎者の昇格申請を承認・却下します。承認すると販売中（active）になり、掲載豆や在庫の登録ができるようになります。
        </p>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--admin-border)', marginTop: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {STATUS_TABS.map(({ key, label }) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--admin-accent)' : '2px solid transparent',
                color: active ? 'var(--cream)' : 'var(--dim)',
                fontSize: '13px',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {error && <p style={{ fontSize: '13px', color: '#e07070', marginBottom: '12px' }}>{error}</p>}

      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--dim)', padding: '40px 0', textAlign: 'center' }}>読み込み中...</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--dim)', padding: '40px 0', textAlign: 'center' }}>
          {tab === 'pending' ? '承認待ちの申請はありません。' : '該当する焙煎者はいません。'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map((r) => {
            const badge = STATUS_BADGE[r.status]
            const actions = ACTIONS[r.status]
            return (
              <div
                key={r.roasterId}
                style={{ background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: '10px', padding: '18px 20px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', color: 'var(--cream)', letterSpacing: '0.04em' }}>{r.displayName}</span>
                  <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '999px', background: badge.bg, color: badge.color, letterSpacing: '0.04em' }}>
                    {badge.label}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--dim)', marginLeft: 'auto', fontFamily: 'var(--font-mono, monospace)' }}>
                    申請 {formatDate(r.createdAt)}
                  </span>
                </div>

                {/* 申告内容 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: '12px', marginBottom: '14px' }}>
                  <span style={{ color: 'var(--dim)' }}>営業</span>
                  <span style={{ color: 'var(--cream)' }}>
                    {LICENSE_LABEL[r.licenseType]}・{r.licenseNo}
                    {r.licenseType === 'permit' && r.licenseExpiry ? `（期限 ${formatDate(r.licenseExpiry)}）` : ''}
                  </span>
                  <span style={{ color: 'var(--dim)' }}>インボイス</span>
                  <span style={{ color: 'var(--cream)' }}>{r.invoiceRegNo ? r.invoiceRegNo : '—（免税）'}</span>
                  <span style={{ color: 'var(--dim)' }}>同意</span>
                  <span style={{ color: 'var(--cream)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(['allowBlend', 'allowNameStory', 'allowSelloutAfterExit'] as const).map((k) => (
                      <span
                        key={k}
                        style={{
                          fontSize: '10px',
                          padding: '1px 8px',
                          borderRadius: '999px',
                          border: '1px solid var(--admin-border)',
                          color: r.optIns[k] ? 'var(--cream)' : 'var(--dim)',
                          opacity: r.optIns[k] ? 1 : 0.5,
                        }}
                      >
                        {r.optIns[k] ? '✓' : '×'} {OPT_IN_LABEL[k]}
                      </span>
                    ))}
                  </span>
                  <span style={{ color: 'var(--dim)' }}>規約</span>
                  <span style={{ color: 'var(--cream)' }}>v{r.termsVersion}（同意 {formatDate(r.termsAgreedAt)}）</span>
                </div>

                {actions.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--admin-border)', paddingTop: '14px' }}>
                    {actions.map((a) => (
                      <button
                        key={a.to}
                        onClick={() => transition(r.roasterId, a.to, a.confirm)}
                        disabled={busy === r.roasterId}
                        style={{
                          padding: '7px 18px',
                          background: a.to === 'active' && r.status === 'pending' ? 'rgba(127,208,168,0.12)' : 'transparent',
                          border: `1px solid ${a.danger ? 'rgba(224,85,85,0.4)' : a.to === 'active' && r.status === 'pending' ? 'rgba(127,208,168,0.5)' : 'var(--admin-border)'}`,
                          borderRadius: '6px',
                          color: a.danger ? '#e07070' : a.to === 'active' && r.status === 'pending' ? '#7Fd0a8' : 'var(--dim)',
                          fontSize: '12px',
                          letterSpacing: '0.04em',
                          cursor: busy === r.roasterId ? 'not-allowed' : 'pointer',
                          opacity: busy === r.roasterId ? 0.5 : 1,
                        }}
                      >
                        {busy === r.roasterId ? '...' : a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
