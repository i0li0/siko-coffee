'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import type { BeanRecord, LotRecord, LotStatus } from '@/types/platform'

const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  fresh: '新鮮',
  discount: '値引き',
  expired: '期限切れ',
}
const LOT_STATUSES: LotStatus[] = ['fresh', 'discount', 'expired']

type OpMode = 'received' | 'waste' | 'stocktake'
const OP_LABEL: Record<OpMode, string> = {
  received: '入荷',
  waste: '廃棄',
  stocktake: '棚卸し',
}

function fmtDate(s: string): string {
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('ja-JP')
}

const cardStyle = {
  width: '100%',
  maxWidth: '620px',
  padding: '32px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
} as const

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

export default function RoasterLotsClient({ initialBeanId }: { initialBeanId: string | null }) {
  const [beans, setBeans] = useState<BeanRecord[] | null>(null)
  const [beanId, setBeanId] = useState<string | null>(initialBeanId)
  const [lots, setLots] = useState<LotRecord[] | null>(null)
  const [lotsForBean, setLotsForBean] = useState<string | null>(null) // lots が属する豆ID（表示ガード）
  const [error, setError] = useState<string | null>(null)
  const [lotsError, setLotsError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // 豆一覧（セレクタ用）
  useEffect(() => {
    fetch('/api/roaster/beans')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((data: BeanRecord[]) => {
        setBeans(data)
        // 初期 beanId が無ければ先頭を選ぶ
        setBeanId((cur) => cur ?? data[0]?.beanId ?? null)
      })
      .catch(() => setError('掲載豆の取得に失敗しました'))
  }, [])

  // 選択中の豆のロットを取得（同期 setState を避け、成否は非同期コールバックでのみ反映）
  useEffect(() => {
    if (!beanId) return
    let cancelled = false
    fetch(`/api/roaster/lots?beanId=${encodeURIComponent(beanId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((data: LotRecord[]) => {
        if (cancelled) return
        setLots(data)
        setLotsForBean(beanId)
        setLotsError(null)
      })
      .catch(() => {
        if (!cancelled) setLotsError('ロットの取得に失敗しました')
      })
    return () => {
      cancelled = true
    }
  }, [beanId])

  function reloadLots() {
    if (!beanId) return
    fetch(`/api/roaster/lots?beanId=${encodeURIComponent(beanId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((data: LotRecord[]) => {
        setLots(data)
        setLotsForBean(beanId)
      })
      .catch(() => setLotsError('ロットの取得に失敗しました'))
  }

  function upsertLot(lot: LotRecord) {
    setLots((prev) => {
      if (!prev) return [lot]
      const idx = prev.findIndex((l) => l.roastDate === lot.roastDate)
      if (idx === -1) return [lot, ...prev].sort((a, b) => (a.roastDate < b.roastDate ? 1 : -1))
      const next = [...prev]
      next[idx] = lot
      return next
    })
  }

  const selectedBean = beans?.find((b) => b.beanId === beanId) ?? null
  // 別の豆へ切り替えた直後は前の豆のロットを見せない（読込済みの豆IDでガード）
  const currentLots = lotsForBean === beanId ? lots : null

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
              在庫ロット
            </h1>
            <Link href="/roaster" style={{ fontSize: '12px', color: 'var(--dim)', textDecoration: 'none', letterSpacing: '0.06em' }}>
              ← 戻る
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 24px', lineHeight: 1.7 }}>
            焙煎日ごとに在庫を管理します。入荷・廃棄・棚卸しで数量を動かせます（確保中のぶんは調整できません）。
          </p>

          {error && <p style={{ fontSize: '13px', color: '#e57373' }}>{error}</p>}
          {beans === null && !error && <p style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>読み込み中...</p>}

          {beans !== null && beans.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--dim)' }}>
              先に豆を登録してください。
              <Link href="/roaster/beans" style={{ color: 'var(--amber)', textDecoration: 'none', marginLeft: '8px' }}>
                豆の管理へ →
              </Link>
            </p>
          )}

          {/* 豆セレクタ */}
          {beans !== null && beans.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <label style={fieldLabel}>豆を選択</label>
              <select style={inputStyle} value={beanId ?? ''} onChange={(e) => setBeanId(e.target.value)}>
                {beans.map((b) => (
                  <option key={b.beanId} value={b.beanId}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ロット追加 */}
          {selectedBean && (
            adding ? (
              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '13px', color: 'var(--cream)', margin: '0 0 14px', letterSpacing: '0.06em' }}>ロットを追加</p>
                <LotAddForm
                  beanId={selectedBean.beanId}
                  onCreated={(lot) => {
                    upsertLot(lot)
                    setAdding(false)
                  }}
                  onCancel={() => setAdding(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
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
                ＋ ロットを追加
              </button>
            )
          )}

          {lotsError && <p style={{ fontSize: '13px', color: '#e57373' }}>{lotsError}</p>}
          {beanId && currentLots === null && !lotsError && <p style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>読み込み中...</p>}
          {currentLots !== null && currentLots.length === 0 && !adding && <p style={{ fontSize: '13px', color: 'var(--dim)' }}>この豆のロットはまだありません。</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {currentLots?.map((lot) => (
              <LotRow key={lot.roastDate} lot={lot} onUpdated={upsertLot} onConflict={reloadLots} />
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

function LotRow({
  lot,
  onUpdated,
  onConflict,
}: {
  lot: LotRecord
  onUpdated: (lot: LotRecord) => void
  onConflict: () => void
}) {
  const [op, setOp] = useState<OpMode | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setRowError(null)
    try {
      const res = await fetch(`/api/roaster/lots/${encodeURIComponent(lot.beanId)}/${encodeURIComponent(lot.roastDate)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError(data.error ?? '更新に失敗しました')
        if (res.status === 409) onConflict()
        return false
      }
      onUpdated(data as LotRecord)
      return true
    } catch {
      setRowError('更新に失敗しました')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function applyOp() {
    if (!op) return
    const n = Number(amount)
    if (op === 'stocktake') {
      if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
        setRowError('0以上の整数を入力してください')
        return
      }
    } else if (!Number.isInteger(n) || n < 1) {
      setRowError('1以上の整数を入力してください')
      return
    }
    const body = op === 'received' ? { receivedG: n } : op === 'waste' ? { wasteG: n } : { onHandG: n }
    const ok = await patch(body)
    if (ok) {
      setOp(null)
      setAmount('')
    }
  }

  return (
    <div style={{ padding: '16px 20px', background: 'rgba(232,224,208,0.04)', borderRadius: '8px', border: '1px solid var(--faint)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{ fontSize: '14px', color: 'var(--cream)', letterSpacing: '0.04em' }}>焙煎 {fmtDate(lot.roastDate)}</span>
        <span style={{ fontSize: '11px', color: 'var(--dim)' }}>鮮度 {fmtDate(lot.freshBy)}</span>
      </div>

      {/* 数量サマリ */}
      <div style={{ display: 'flex', gap: '18px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <Metric label="在庫" value={`${lot.onHandG.toLocaleString()}g`} accent />
        <Metric label="確保中" value={`${lot.reservedG.toLocaleString()}g`} />
        <Metric label="出荷可" value={`${lot.availableG.toLocaleString()}g`} />
        <Metric label="廃棄累計" value={`${lot.wastedG.toLocaleString()}g`} />
      </div>

      {rowError && <p style={{ fontSize: '12px', color: '#e57373', margin: '0 0 10px' }}>{rowError}</p>}

      {/* 鮮度ステータス */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1px solid var(--faint)', borderRadius: '6px', overflow: 'hidden' }}>
          {LOT_STATUSES.map((s) => {
            const active = lot.status === s
            return (
              <button
                key={s}
                onClick={() => !active && patch({ status: s })}
                disabled={busy || active}
                style={{
                  background: active ? 'rgba(212,160,23,0.14)' : 'transparent',
                  border: 'none',
                  borderRight: s !== 'expired' ? '1px solid var(--faint)' : 'none',
                  padding: '6px 12px',
                  color: active ? 'var(--amber)' : 'var(--dim)',
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  cursor: busy || active ? 'default' : 'pointer',
                }}
              >
                {LOT_STATUS_LABEL[s]}
              </button>
            )
          })}
        </div>

        {/* 数量操作トリガ */}
        {op === null && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['received', 'waste', 'stocktake'] as OpMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setOp(m)
                  setAmount(m === 'stocktake' ? String(lot.onHandG) : '')
                  setRowError(null)
                }}
                disabled={busy}
                style={{ background: 'transparent', border: '1px solid var(--faint)', borderRadius: '6px', padding: '6px 12px', color: 'var(--dim)', fontSize: '11px', letterSpacing: '0.06em', cursor: 'pointer' }}
              >
                {OP_LABEL[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 数量操作パネル */}
      {op !== null && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginTop: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>{OP_LABEL[op]}（g）{op === 'stocktake' && ' ＝ 在庫の絶対値'}</label>
            <input style={inputStyle} type="number" inputMode="numeric" min={op === 'stocktake' ? 0 : 1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <button
            onClick={applyOp}
            disabled={busy}
            style={{ background: 'transparent', border: '1px solid var(--amber)', borderRadius: '6px', padding: '10px 18px', color: 'var(--amber)', fontSize: '12px', letterSpacing: '0.06em', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
          >
            {busy ? '...' : '実行'}
          </button>
          <button
            onClick={() => {
              setOp(null)
              setAmount('')
              setRowError(null)
            }}
            disabled={busy}
            style={{ background: 'transparent', border: '1px solid var(--faint)', borderRadius: '6px', padding: '10px 14px', color: 'var(--dim)', fontSize: '12px', cursor: 'pointer' }}
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: '10px', color: 'var(--dim)', margin: '0 0 2px', letterSpacing: '0.08em' }}>{label}</p>
      <p style={{ fontSize: '14px', color: accent ? 'var(--amber)' : 'var(--cream)', margin: 0, fontFamily: 'var(--font-serif)' }}>{value}</p>
    </div>
  )
}

interface LotAddState {
  roastDate: string
  onHandG: string
  parRankG: string
  freshBy: string
  status: LotStatus
}

function LotAddForm({
  beanId,
  onCreated,
  onCancel,
}: {
  beanId: string
  onCreated: (lot: LotRecord) => void
  onCancel: () => void
}) {
  const [f, setF] = useState<LotAddState>({ roastDate: '', onHandG: '', parRankG: '', freshBy: '', status: 'fresh' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof LotAddState>(k: K, v: LotAddState[K]) => setF((p) => ({ ...p, [k]: v }))

  async function submit() {
    const onHand = Number(f.onHandG)
    const par = Number(f.parRankG)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.roastDate)) return setErr('焙煎日を入力してください')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.freshBy)) return setErr('鮮度期限を入力してください')
    if (!Number.isInteger(onHand) || onHand < 0) return setErr('在庫は0以上の整数で入力してください')
    if (!Number.isInteger(par) || par < 0 || par % 100 !== 0) return setErr('在庫ランク上限は100g刻みで入力してください')
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/roaster/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beanId, roastDate: f.roastDate, onHandG: onHand, parRankG: par, freshBy: f.freshBy, status: f.status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error ?? '追加に失敗しました')
        return
      }
      onCreated(data as LotRecord)
    } catch {
      setErr('追加に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px 20px', background: 'rgba(232,224,208,0.04)', borderRadius: '8px', border: '1px solid var(--faint)' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>焙煎日</label>
          <input style={inputStyle} type="date" value={f.roastDate} onChange={(e) => set('roastDate', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>鮮度期限</label>
          <input style={inputStyle} type="date" value={f.freshBy} onChange={(e) => set('freshBy', e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>初期在庫（g）</label>
          <input style={inputStyle} type="number" inputMode="numeric" min={0} value={f.onHandG} onChange={(e) => set('onHandG', e.target.value)} placeholder="1000" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>在庫ランク上限（g・100刻み）</label>
          <input style={inputStyle} type="number" inputMode="numeric" min={0} step={100} value={f.parRankG} onChange={(e) => set('parRankG', e.target.value)} placeholder="2000" />
        </div>
      </div>
      {err && <p style={{ fontSize: '12px', color: '#e57373', margin: 0 }}>{err}</p>}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={submit}
          disabled={busy}
          style={{ flex: 1, background: 'transparent', border: '1px solid var(--amber)', borderRadius: '6px', padding: '11px', color: 'var(--amber)', fontSize: '13px', letterSpacing: '0.08em', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
        >
          {busy ? '処理中...' : '追加'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{ background: 'transparent', border: '1px solid var(--faint)', borderRadius: '6px', padding: '11px 20px', color: 'var(--dim)', fontSize: '13px', letterSpacing: '0.08em', cursor: 'pointer' }}
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
