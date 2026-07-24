'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import type { BeanRecord, BeanOrderStatus, RoastLevel } from '@/types/platform'

const ROAST_LABEL: Record<RoastLevel, string> = {
  light: 'ライト',
  cinnamon: 'シナモン',
  medium: 'ミディアム',
  high: 'ハイ',
  city: 'シティ',
  full_city: 'フルシティ',
  french: 'フレンチ',
  italian: 'イタリアン',
}
const ROAST_LEVELS = Object.keys(ROAST_LABEL) as RoastLevel[]

const STATUS_LABEL: Record<BeanOrderStatus, string> = {
  on: '受注中',
  paused: '休止',
  off: '非公開',
}
const STATUSES: BeanOrderStatus[] = ['on', 'paused', 'off']

interface BeanForm {
  name: string
  greenOrigin: string
  roastLevel: RoastLevel
  pricePer100g: string
  weeklyCapKg: string
  leadTimeDays: string
  orderStatus: BeanOrderStatus
}

const EMPTY_FORM: BeanForm = {
  name: '',
  greenOrigin: '',
  roastLevel: 'medium',
  pricePer100g: '',
  weeklyCapKg: '',
  leadTimeDays: '',
  orderStatus: 'on',
}

function toForm(b: BeanRecord): BeanForm {
  return {
    name: b.name,
    greenOrigin: b.greenOrigin,
    roastLevel: b.roastLevel,
    pricePer100g: String(b.pricePer100g),
    weeklyCapKg: String(b.weeklyCapKg),
    leadTimeDays: String(b.leadTimeDays),
    orderStatus: b.orderStatus,
  }
}

// 送信用に数値へ。空欄や不正は null で弾く。
function toPayload(f: BeanForm): Record<string, unknown> | null {
  const price = Number(f.pricePer100g)
  const cap = Number(f.weeklyCapKg)
  const lead = Number(f.leadTimeDays)
  if (!f.name.trim() || !f.greenOrigin.trim()) return null
  if (!Number.isInteger(price) || price < 1) return null
  if (Number.isNaN(cap) || cap < 0) return null
  if (!Number.isInteger(lead) || lead < 0) return null
  return {
    name: f.name.trim(),
    greenOrigin: f.greenOrigin.trim(),
    roastLevel: f.roastLevel,
    pricePer100g: price,
    weeklyCapKg: cap,
    leadTimeDays: lead,
    orderStatus: f.orderStatus,
  }
}

const cardStyle = {
  width: '100%',
  maxWidth: '560px',
  padding: '32px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
} as const

export default function RoasterBeansClient() {
  const [beans, setBeans] = useState<BeanRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/roaster/beans')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((data: BeanRecord[]) => setBeans(data))
      .catch(() => setError('掲載豆の取得に失敗しました'))
  }, [])

  async function createBean(form: BeanForm) {
    const payload = toPayload(form)
    if (!payload) {
      setFormError('入力内容を確認してください（価格は1円以上の整数、上限・LTは0以上）')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const res = await fetch('/api/roaster/beans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error ?? '追加に失敗しました')
        return
      }
      setBeans((prev) => [data as BeanRecord, ...(prev ?? [])])
      setAdding(false)
    } catch {
      setFormError('追加に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function patchBean(beanId: string, patch: Record<string, unknown>) {
    setBusy(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/roaster/beans/${encodeURIComponent(beanId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error ?? '更新に失敗しました')
        return false
      }
      setBeans((prev) => (prev ? prev.map((b) => (b.beanId === beanId ? (data as BeanRecord) : b)) : prev))
      return true
    } catch {
      setFormError('更新に失敗しました')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(beanId: string, form: BeanForm) {
    const payload = toPayload(form)
    if (!payload) {
      setFormError('入力内容を確認してください')
      return
    }
    const ok = await patchBean(beanId, payload)
    if (ok) setEditingId(null)
  }

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
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 300, color: 'var(--cream)', letterSpacing: '0.14em', margin: 0 }}>
              豆の管理
            </h1>
            <Link href="/roaster" style={{ fontSize: '12px', color: 'var(--dim)', textDecoration: 'none', letterSpacing: '0.06em' }}>
              ← 戻る
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 24px', lineHeight: 1.7 }}>
            ブレンドに掲載する豆を登録します。価格は税込・100gあたり。受注中の豆だけが公開カタログに載ります。
          </p>

          {error && <p style={{ fontSize: '13px', color: '#e57373' }}>{error}</p>}
          {beans === null && !error && <p style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>読み込み中...</p>}

          {/* 追加フォーム / 追加ボタン */}
          {adding ? (
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--cream)', margin: '0 0 14px', letterSpacing: '0.06em' }}>豆を追加</p>
              <BeanFields
                initial={EMPTY_FORM}
                busy={busy}
                error={formError}
                submitLabel="追加"
                onSubmit={createBean}
                onCancel={() => {
                  setAdding(false)
                  setFormError(null)
                }}
              />
            </div>
          ) : (
            beans !== null && (
              <button
                onClick={() => {
                  setAdding(true)
                  setEditingId(null)
                  setFormError(null)
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px dashed var(--faint)',
                  borderRadius: '8px',
                  padding: '14px',
                  color: 'var(--dim)',
                  fontSize: '13px',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  marginBottom: '24px',
                }}
              >
                ＋ 豆を追加
              </button>
            )
          )}

          {/* 一覧 */}
          {beans !== null && beans.length === 0 && !adding && (
            <p style={{ fontSize: '13px', color: 'var(--dim)' }}>まだ掲載豆がありません。</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {beans?.map((bean) =>
              editingId === bean.beanId ? (
                <div key={bean.beanId} style={{ padding: '18px 20px', background: 'rgba(232,224,208,0.04)', borderRadius: '8px', border: '1px solid var(--faint)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--cream)', margin: '0 0 14px', letterSpacing: '0.06em' }}>編集</p>
                  <BeanFields
                    initial={toForm(bean)}
                    busy={busy}
                    error={formError}
                    submitLabel="保存"
                    onSubmit={(f) => saveEdit(bean.beanId, f)}
                    onCancel={() => {
                      setEditingId(null)
                      setFormError(null)
                    }}
                  />
                </div>
              ) : (
                <BeanRow
                  key={bean.beanId}
                  bean={bean}
                  busy={busy}
                  onEdit={() => {
                    setEditingId(bean.beanId)
                    setAdding(false)
                    setFormError(null)
                  }}
                  onStatus={(s) => patchBean(bean.beanId, { orderStatus: s })}
                />
              ),
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

function BeanRow({
  bean,
  busy,
  onEdit,
  onStatus,
}: {
  bean: BeanRecord
  busy: boolean
  onEdit: () => void
  onStatus: (s: BeanOrderStatus) => void
}) {
  return (
    <div style={{ padding: '16px 20px', background: 'rgba(232,224,208,0.04)', borderRadius: '8px', border: '1px solid var(--faint)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontSize: '15px', color: 'var(--cream)', letterSpacing: '0.04em' }}>{bean.name}</span>
        <span style={{ fontSize: '14px', color: 'var(--amber)', fontFamily: 'var(--font-serif)' }}>¥{bean.pricePer100g.toLocaleString()}/100g</span>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--dim)', margin: '0 0 12px', lineHeight: 1.6 }}>
        {bean.greenOrigin} ・ {ROAST_LABEL[bean.roastLevel]} ・ 上限{bean.weeklyCapKg}kg/週 ・ LT{bean.leadTimeDays}日
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        {/* 受注ステータスのセグメント切替 */}
        <div style={{ display: 'flex', border: '1px solid var(--faint)', borderRadius: '6px', overflow: 'hidden' }}>
          {STATUSES.map((s) => {
            const active = bean.orderStatus === s
            return (
              <button
                key={s}
                onClick={() => !active && onStatus(s)}
                disabled={busy || active}
                style={{
                  background: active ? 'rgba(212,160,23,0.14)' : 'transparent',
                  border: 'none',
                  borderRight: s !== 'off' ? '1px solid var(--faint)' : 'none',
                  padding: '6px 12px',
                  color: active ? 'var(--amber)' : 'var(--dim)',
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  cursor: busy || active ? 'default' : 'pointer',
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link
            href={`/roaster/lots?beanId=${encodeURIComponent(bean.beanId)}`}
            style={{ background: 'transparent', border: '1px solid var(--faint)', borderRadius: '6px', padding: '6px 16px', color: 'var(--dim)', fontSize: '12px', letterSpacing: '0.06em', textDecoration: 'none' }}
          >
            在庫
          </Link>
          <button
            onClick={onEdit}
            style={{ background: 'transparent', border: '1px solid var(--faint)', borderRadius: '6px', padding: '6px 16px', color: 'var(--dim)', fontSize: '12px', letterSpacing: '0.06em', cursor: 'pointer' }}
          >
            編集
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--faint)',
  borderRadius: '6px',
  padding: '10px 12px',
  color: 'var(--cream)',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box' as const,
}
const fieldLabel = { fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.06em', margin: '0 0 6px', display: 'block' } as const

function BeanFields({
  initial,
  busy,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: BeanForm
  busy: boolean
  error: string | null
  submitLabel: string
  onSubmit: (f: BeanForm) => void
  onCancel: () => void
}) {
  const [f, setF] = useState<BeanForm>(initial)
  const set = <K extends keyof BeanForm>(k: K, v: BeanForm[K]) => setF((prev) => ({ ...prev, [k]: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={fieldLabel}>豆の名前</label>
        <input style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={60} placeholder="例）エチオピア イルガチェフェ" />
      </div>
      <div>
        <label style={fieldLabel}>生豆生産国 / 地域</label>
        <input style={inputStyle} value={f.greenOrigin} onChange={(e) => set('greenOrigin', e.target.value)} maxLength={100} placeholder="例）エチオピア" />
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>焙煎度</label>
          <select style={inputStyle} value={f.roastLevel} onChange={(e) => set('roastLevel', e.target.value as RoastLevel)}>
            {ROAST_LEVELS.map((r) => (
              <option key={r} value={r}>
                {ROAST_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>価格（円/100g・税込）</label>
          <input style={inputStyle} type="number" inputMode="numeric" min={1} value={f.pricePer100g} onChange={(e) => set('pricePer100g', e.target.value)} placeholder="800" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>週あたり受注上限（kg）</label>
          <input style={inputStyle} type="number" inputMode="decimal" min={0} step="0.1" value={f.weeklyCapKg} onChange={(e) => set('weeklyCapKg', e.target.value)} placeholder="5" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>リードタイム（日）</label>
          <input style={inputStyle} type="number" inputMode="numeric" min={0} value={f.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} placeholder="3" />
        </div>
      </div>
      <div>
        <label style={fieldLabel}>受注ステータス</label>
        <select style={inputStyle} value={f.orderStatus} onChange={(e) => set('orderStatus', e.target.value as BeanOrderStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={{ fontSize: '12px', color: '#e57373', margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => onSubmit(f)}
          disabled={busy}
          style={{ flex: 1, background: 'transparent', border: '1px solid var(--amber)', borderRadius: '6px', padding: '11px', color: 'var(--amber)', fontSize: '13px', letterSpacing: '0.08em', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
        >
          {busy ? '処理中...' : submitLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{ background: 'transparent', border: '1px solid var(--faint)', borderRadius: '6px', padding: '11px 20px', color: 'var(--dim)', fontSize: '13px', letterSpacing: '0.08em', cursor: busy ? 'not-allowed' : 'pointer' }}
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
