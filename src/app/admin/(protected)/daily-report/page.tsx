'use client'

import { useState, useMemo } from 'react'
import { DRINK_UNIT_PRICE, BEAN_PRICE_PER_100G } from '@/lib/constants'

const today = () => new Date().toISOString().slice(0, 10)

function yen(n: number) {
  return `¥${n.toLocaleString()}`
}

export default function DailyReportPage() {
  const [date, setDate] = useState(today)
  const [drinkCount, setDrinkCount] = useState('')
  const [beanGrams, setBeanGrams] = useState('')
  const [customers, setCustomers] = useState('')
  const [suppliesCost, setSuppliesCost] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const drinks = Number(drinkCount) || 0
  const beans = Number(beanGrams) || 0
  const cust = Number(customers) || 0
  const supplies = Number(suppliesCost) || 0

  const summary = useMemo(() => {
    const drinkRevenue = drinks * DRINK_UNIT_PRICE
    const beanRevenue = Math.round((beans / 100) * BEAN_PRICE_PER_100G)
    const total = drinkRevenue + beanRevenue
    const profit = total - supplies
    const unitPrice = cust > 0 ? Math.round(total / cust) : 0
    return { drinkRevenue, beanRevenue, total, profit, unitPrice }
  }, [drinks, beans, cust, supplies])

  async function handleSave() {
    if (!date) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, drinkCount: drinks, beanGrams: beans, customers: cust, suppliesCost: supplies, memo }),
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('保存に失敗しました')
    } finally {
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
    fontSize: '11px',
    color: 'var(--dim)',
    letterSpacing: '0.10em',
    display: 'block',
    marginBottom: '6px',
  }

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between' as const,
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--admin-border)',
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em', marginBottom: '28px' }}>
        営業日レポート
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>

        {/* 左カラム：入力フォーム */}
        <div style={{
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}>
          <div>
            <label style={labelStyle}>営業日</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>ドリンク提供数（杯）</label>
              <input
                type="number" min="0" value={drinkCount}
                onChange={e => setDrinkCount(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>客数</label>
              <input
                type="number" min="0" value={customers}
                onChange={e => setCustomers(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>豆販売量（g）</label>
              <input
                type="number" min="0" value={beanGrams}
                onChange={e => setBeanGrams(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>消耗品費（円）</label>
              <input
                type="number" min="0" value={suppliesCost}
                onChange={e => setSuppliesCost(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>メモ（天候・客層・特記事項）</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={4}
              placeholder="今日の記録..."
              style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.6 }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '13px', color: 'var(--admin-danger)' }}>{error}</p>
          )}
          {saved && (
            <p style={{ fontSize: '13px', color: 'var(--admin-success)' }}>保存しました</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !date}
            style={{
              padding: '12px',
              background: saving ? 'transparent' : 'var(--admin-accent)',
              border: '1px solid var(--admin-accent)',
              borderRadius: '6px',
              color: saving ? 'var(--dim)' : '#0d0d14',
              fontSize: '13px',
              letterSpacing: '0.10em',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>

        {/* 右カラム：リアルタイム収支サマリー */}
        <div style={{
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          padding: '24px',
        }}>
          <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '16px' }}>
            収支サマリー
          </p>

          <div>
            <div style={rowStyle}>
              <span style={{ fontSize: '13px', color: 'var(--dim)' }}>ドリンク売上</span>
              <span style={{ fontSize: '14px', color: 'var(--cream)' }}>{yen(summary.drinkRevenue)}</span>
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: '13px', color: 'var(--dim)' }}>豆売上</span>
              <span style={{ fontSize: '14px', color: 'var(--cream)' }}>{yen(summary.beanRevenue)}</span>
            </div>
            <div style={{ ...rowStyle, borderBottomColor: 'rgba(240,235,224,0.16)' }}>
              <span style={{ fontSize: '13px', color: 'var(--cream)', fontWeight: 400 }}>売上合計</span>
              <span style={{ fontSize: '16px', color: 'var(--cream)' }}>{yen(summary.total)}</span>
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: '13px', color: 'var(--dim)' }}>消耗品費</span>
              <span style={{ fontSize: '14px', color: supplies > 0 ? 'var(--admin-danger)' : 'var(--dim)' }}>
                {supplies > 0 ? `−${yen(supplies)}` : '¥0'}
              </span>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none', paddingTop: '14px' }}>
              <span style={{ fontSize: '13px', color: 'var(--cream)' }}>純利益</span>
              <span style={{
                fontSize: '20px',
                fontWeight: 300,
                color: summary.profit >= 0 ? 'var(--admin-success)' : 'var(--admin-danger)',
              }}>
                {yen(summary.profit)}
              </span>
            </div>
          </div>

          {cust > 0 && (
            <div style={{
              marginTop: '20px',
              padding: '12px',
              background: 'rgba(240,235,224,0.04)',
              borderRadius: '6px',
            }}>
              <p style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>客単価</p>
              <p style={{ fontSize: '18px', color: 'var(--admin-accent)' }}>{yen(summary.unitPrice)}</p>
            </div>
          )}

          {drinks > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: 'rgba(240,235,224,0.04)',
              borderRadius: '6px',
            }}>
              <p style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>ドリンク単価確認</p>
              <p style={{ fontSize: '13px', color: 'var(--dim)' }}>
                {drinks} 杯 × ¥500 = {yen(summary.drinkRevenue)}
              </p>
              {beans > 0 && (
                <p style={{ fontSize: '13px', color: 'var(--dim)', marginTop: '4px' }}>
                  豆 {beans}g → {yen(summary.beanRevenue)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
