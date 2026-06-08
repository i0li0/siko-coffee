'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { CATEGORY_LABEL } from '@/lib/expenseCategories'
import { FIXED_RENT } from '@/lib/constants'
import type { ExpenseItem } from '@/types/admin'

function yen(n: number) { return `¥${Math.round(n).toLocaleString()}` }

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthOptions() {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push(ym)
  }
  return options
}

export default function ExpensesPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth)
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/expenses?yearMonth=${yearMonth}`)
      .then(r => r.json())
      .then((data: ExpenseItem[]) => {
        setExpenses(Array.isArray(data) ? data.sort((a, b) => b.date.localeCompare(a.date)) : [])
        setLoading(false)
      })
  }, [yearMonth])

  async function handleDelete(id: string) {
    if (!confirm('この経費を削除しますか？')) return
    await fetch(`/api/admin/expenses?yearMonth=${yearMonth}&id=${id}`, { method: 'DELETE' })
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = { rent: FIXED_RENT }
    for (const e of expenses) {
      map[e.category] = (map[e.category] ?? 0) + e.allocatedAmount
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0)
  }, [expenses])

  const grandTotal = useMemo(
    () => expenses.reduce((s, e) => s + e.allocatedAmount, 0) + FIXED_RENT,
    [expenses]
  )

  const thStyle = {
    fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.12em',
    padding: '8px 12px', textAlign: 'left' as const,
    borderBottom: '1px solid var(--admin-border)',
  }
  const tdStyle = {
    fontSize: '13px', color: 'var(--cream)',
    padding: '11px 12px',
    borderBottom: '1px solid var(--admin-border)',
  }

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>経費管理</h2>
        <Link
          href="/admin/expenses/new"
          style={{
            padding: '9px 20px', background: 'var(--admin-accent)',
            borderRadius: '6px', color: '#0d0d14',
            fontSize: '13px', letterSpacing: '0.08em', textDecoration: 'none',
          }}
        >
          + 新規追加
        </Link>
      </div>

      {/* 月セレクター */}
      <div style={{ marginBottom: '24px' }}>
        <select
          value={yearMonth}
          onChange={e => setYearMonth(e.target.value)}
          style={{
            background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
            borderRadius: '6px', padding: '9px 14px', color: 'var(--cream)',
            fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none',
          }}
        >
          {monthOptions().map(ym => (
            <option key={ym} value={ym}>{ym.replace('-', '年')}月</option>
          ))}
        </select>
      </div>

      {/* カテゴリ別集計サマリー */}
      <div style={{
        background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
        borderRadius: '8px', padding: '20px 24px', marginBottom: '20px',
      }}>
        <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '16px' }}>
          カテゴリ別集計（按分後）
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
          {categoryTotals.map(([cat, amt]) => (
            <div key={cat} style={{
              padding: '10px 14px', background: 'rgba(240,235,224,0.04)',
              borderRadius: '6px',
            }}>
              <p style={{ fontSize: '10px', color: 'var(--dim)', marginBottom: '4px' }}>
                {CATEGORY_LABEL[cat] ?? cat}
                {cat === 'rent' && <span style={{ marginLeft: '4px', fontSize: '9px', color: 'var(--admin-warning)' }}>固定</span>}
              </p>
              <p style={{ fontSize: '15px', color: 'var(--cream)' }}>{yen(amt)}</p>
            </div>
          ))}
          <div style={{
            padding: '10px 14px', background: 'rgba(184,190,200,0.08)',
            borderRadius: '6px', border: '1px solid var(--admin-border)',
          }}>
            <p style={{ fontSize: '10px', color: 'var(--dim)', marginBottom: '4px' }}>合計</p>
            <p style={{ fontSize: '15px', color: 'var(--admin-accent)', fontWeight: 400 }}>{yen(grandTotal)}</p>
          </div>
        </div>
      </div>

      {/* 経費一覧テーブル */}
      <div style={{
        background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
        borderRadius: '8px', overflow: 'hidden',
      }}>
        {loading ? (
          <p style={{ padding: '24px', color: 'var(--dim)', fontSize: '13px' }}>読み込み中...</p>
        ) : expenses.length === 0 ? (
          <p style={{ padding: '24px', color: 'var(--dim)', fontSize: '13px' }}>この月の経費記録はありません</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>日付</th>
                <th style={thStyle}>勘定科目</th>
                <th style={thStyle}>摘要</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>按分率</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>按分後</th>
                <th style={{ ...thStyle, width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td style={{ ...tdStyle, color: 'var(--dim)' }}>{e.date}</td>
                  <td style={tdStyle}>{CATEGORY_LABEL[e.category] ?? e.category}</td>
                  <td style={{ ...tdStyle, color: 'var(--dim)' }}>{e.description || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{yen(e.amount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--dim)' }}>
                    {Math.round(e.allocationRate * 100)}%
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{yen(e.allocatedAmount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => handleDelete(e.id)}
                      style={{
                        background: 'none', border: 'none',
                        color: 'var(--admin-danger)', cursor: 'pointer', fontSize: '12px',
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
