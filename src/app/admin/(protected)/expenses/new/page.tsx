'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CATEGORIES } from '@/lib/expenseCategories'

const ALLOCATION_PRESETS = [
  { label: '100%', value: 1 },
  { label: '80%', value: 0.8 },
  { label: '50%', value: 0.5 },
  { label: '30%', value: 0.3 },
]

const today = () => new Date().toISOString().slice(0, 10)

function yen(n: number) { return `¥${Math.round(n).toLocaleString()}` }

export default function ExpensesNewPage() {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState('supplies')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [allocationRate, setAllocationRate] = useState(1)
  const [customRate, setCustomRate] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const effectiveRate = isCustom ? (Number(customRate) / 100 || 0) : allocationRate
  const allocatedAmount = useMemo(
    () => Math.round(Number(amount) * effectiveRate),
    [amount, effectiveRate]
  )

  async function handleSave() {
    if (!date || !amount) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, category, amount: Number(amount), description, allocationRate: effectiveRate }),
      })
      if (!res.ok) throw new Error()
      router.push('/admin/expenses')
    } catch {
      setError('保存に失敗しました')
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--admin-sidebar-bg)',
    border: '1px solid var(--admin-border)',
    borderRadius: '6px',
    padding: '10px 12px',
    color: 'var(--cream)',
    fontSize: '14px',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    width: '100%',
  }

  const labelStyle = {
    fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.10em',
    display: 'block', marginBottom: '6px',
  }

  return (
    <div style={{ maxWidth: '520px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: '13px' }}
        >
          ← 戻る
        </button>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>経費を追加</h2>
      </div>

      <div style={{
        background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
        borderRadius: '8px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px',
      }}>
        <div>
          <label style={labelStyle}>日付</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>勘定科目</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>金額（円）</label>
          <input
            type="number" min="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>摘要</label>
          <input
            type="text" value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="内容を入力..."
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>按分率</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
            {ALLOCATION_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => { setAllocationRate(p.value); setIsCustom(false) }}
                style={{
                  padding: '7px 16px',
                  borderRadius: '5px',
                  border: '1px solid var(--admin-border)',
                  background: !isCustom && allocationRate === p.value
                    ? 'var(--admin-accent)' : 'var(--admin-sidebar-bg)',
                  color: !isCustom && allocationRate === p.value ? '#0d0d14' : 'var(--dim)',
                  fontSize: '13px', cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setIsCustom(true)}
              style={{
                padding: '7px 16px', borderRadius: '5px',
                border: '1px solid var(--admin-border)',
                background: isCustom ? 'var(--admin-accent)' : 'var(--admin-sidebar-bg)',
                color: isCustom ? '#0d0d14' : 'var(--dim)',
                fontSize: '13px', cursor: 'pointer',
              }}
            >
              カスタム
            </button>
          </div>
          {isCustom && (
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number" min="0" max="100" value={customRate}
                onChange={e => setCustomRate(e.target.value)}
                placeholder="例: 40"
                style={{ ...inputStyle, width: '100px' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--dim)' }}>%</span>
            </div>
          )}
        </div>

        {/* 按分後金額プレビュー */}
        {amount && (
          <div style={{
            padding: '14px 16px', background: 'rgba(240,235,224,0.04)',
            borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--dim)' }}>
              按分後金額 ({Math.round(effectiveRate * 100)}%)
            </span>
            <span style={{ fontSize: '18px', color: 'var(--admin-accent)' }}>
              {yen(allocatedAmount)}
            </span>
          </div>
        )}

        {error && <p style={{ fontSize: '13px', color: 'var(--admin-danger)' }}>{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !date || !amount}
          style={{
            padding: '12px', background: saving ? 'transparent' : 'var(--admin-accent)',
            border: '1px solid var(--admin-accent)', borderRadius: '6px',
            color: saving ? 'var(--dim)' : '#0d0d14',
            fontSize: '13px', letterSpacing: '0.10em',
            cursor: saving || !amount ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  )
}
