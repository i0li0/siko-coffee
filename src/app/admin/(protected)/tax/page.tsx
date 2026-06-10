'use client'

import { useEffect, useState, useMemo } from 'react'
import { CATEGORY_LABEL } from '@/lib/expenseCategories'
import { FIXED_RENT } from '@/lib/constants'
const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']

type SaleItem  = { type: string; amount: number }
type ExpenseItem = { category: string; allocatedAmount: number; date: string; description: string; amount: number; allocationRate: number }

function yen(n: number) { return `¥${Math.round(n).toLocaleString()}` }

function currentYear() { return new Date().getFullYear() }

function yearOptions() {
  const y = currentYear()
  return [y, y - 1, y - 2]
}

export default function TaxPage() {
  const [year, setYear] = useState(currentYear)
  const [allSales, setAllSales] = useState<SaleItem[]>([])
  const [allExpenses, setAllExpenses] = useState<ExpenseItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all(
      MONTHS.flatMap(m => [
        fetch(`/api/admin/sales?month=${year}-${m}`).then(r => r.json()),
        fetch(`/api/admin/expenses?yearMonth=${year}-${m}`).then(r => r.json()),
      ])
    ).then(results => {
      if (cancelled) return
      const sales: SaleItem[] = []
      const expenses: ExpenseItem[] = []
      results.forEach((data, i) => {
        if (!Array.isArray(data)) return
        if (i % 2 === 0) sales.push(...data)
        else expenses.push(...data)
      })
      setAllSales(sales)
      setAllExpenses(expenses)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year])

  const income = useMemo(() => {
    const drink = allSales.filter(s => s.type === 'drink').reduce((s, i) => s + i.amount, 0)
    const beans = allSales.filter(s => s.type === 'beans').reduce((s, i) => s + i.amount, 0)
    const ec    = allSales.filter(s => s.type === 'ec').reduce((s, i) => s + i.amount, 0)
    return { drink, beans, ec, total: drink + beans + ec }
  }, [allSales])

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = { rent: FIXED_RENT * 12 }
    for (const e of allExpenses) {
      map[e.category] = (map[e.category] ?? 0) + e.allocatedAmount
    }
    return Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }, [allExpenses])

  const expenseTotal = useMemo(
    () => expenseByCategory.reduce((s, [, v]) => s + v, 0),
    [expenseByCategory]
  )

  const netIncome = income.total - expenseTotal

  // CSV出力（freee/マネーフォワード形式）
  function exportCSV() {
    const rows = [
      ['日付', '勘定科目', '摘要', '金額', '按分率', '按分後金額'],
      ...allExpenses.map(e => [
        e.date,
        CATEGORY_LABEL[e.category] ?? e.category,
        e.description,
        e.amount,
        Math.round(e.allocationRate * 100) + '%',
        e.allocatedAmount,
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `siko-coffee-expenses-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sectionStyle = {
    background: 'var(--admin-card-bg)',
    border: '1px solid var(--admin-border)',
    borderRadius: '8px',
    padding: '24px 28px',
    marginBottom: '16px',
  }

  const rowStyle = {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    padding: '9px 0',
    borderBottom: '1px solid var(--admin-border)',
  }

  const totalRowStyle = {
    ...rowStyle,
    borderBottom: 'none',
    paddingTop: '14px',
    marginTop: '4px',
    borderTop: '1px solid rgba(240,235,224,0.16)',
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <p style={{ color: 'var(--dim)', fontSize: '13px' }}>読み込み中...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: '720px' }} className="tax-page">
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>確定申告用出力</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }} className="no-print">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{
              background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
              borderRadius: '6px', padding: '8px 12px', color: 'var(--cream)',
              fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none',
            }}
          >
            {yearOptions().map(y => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <button
            onClick={exportCSV}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--admin-border)', borderRadius: '6px',
              color: 'var(--dim)', fontSize: '12px', cursor: 'pointer', letterSpacing: '0.08em',
            }}
          >
            CSV出力
          </button>
          <button
            onClick={() => window.print()}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--admin-border)', borderRadius: '6px',
              color: 'var(--dim)', fontSize: '12px', cursor: 'pointer', letterSpacing: '0.08em',
            }}
          >
            印刷
          </button>
        </div>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--dim)', marginBottom: '24px' }}>
        {year}年度 収支計算書（副業・雑所得）
      </p>

      {/* 収入の部 */}
      <div style={sectionStyle}>
        <p style={{ fontSize: '11px', color: 'var(--admin-accent)', letterSpacing: '0.14em', marginBottom: '16px' }}>
          【収入の部】
        </p>
        <div style={rowStyle}>
          <span style={{ fontSize: '13px', color: 'var(--dim)' }}>店舗売上（ドリンク）</span>
          <span style={{ fontSize: '14px', color: 'var(--cream)' }}>{yen(income.drink)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ fontSize: '13px', color: 'var(--dim)' }}>店舗売上（豆販売）</span>
          <span style={{ fontSize: '14px', color: 'var(--cream)' }}>{yen(income.beans)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ fontSize: '13px', color: 'var(--dim)' }}>EC売上</span>
          <span style={{ fontSize: '14px', color: 'var(--cream)' }}>{yen(income.ec)}</span>
        </div>
        <div style={totalRowStyle}>
          <span style={{ fontSize: '14px', color: 'var(--cream)', fontWeight: 400 }}>収入合計</span>
          <span style={{ fontSize: '18px', color: 'var(--cream)' }}>{yen(income.total)}</span>
        </div>
      </div>

      {/* 経費の部 */}
      <div style={sectionStyle}>
        <p style={{ fontSize: '11px', color: 'var(--admin-accent)', letterSpacing: '0.14em', marginBottom: '16px' }}>
          【経費の部】
        </p>
        {expenseByCategory.map(([cat, amt]) => (
          <div key={cat} style={rowStyle}>
            <span style={{ fontSize: '13px', color: 'var(--dim)' }}>
              {CATEGORY_LABEL[cat] ?? cat}
              {cat === 'rent' && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--admin-warning)' }}>（固定 ¥{FIXED_RENT.toLocaleString()}×12）</span>}
            </span>
            <span style={{ fontSize: '14px', color: 'var(--cream)' }}>{yen(amt)}</span>
          </div>
        ))}
        <div style={totalRowStyle}>
          <span style={{ fontSize: '14px', color: 'var(--cream)', fontWeight: 400 }}>経費合計</span>
          <span style={{ fontSize: '18px', color: 'var(--cream)' }}>{yen(expenseTotal)}</span>
        </div>
      </div>

      {/* 損益 */}
      <div style={sectionStyle}>
        <p style={{ fontSize: '11px', color: 'var(--admin-accent)', letterSpacing: '0.14em', marginBottom: '16px' }}>
          【損益】
        </p>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={{ fontSize: '15px', color: 'var(--cream)' }}>
            {netIncome >= 0 ? '所得金額' : '損失金額'}
          </span>
          <span style={{
            fontSize: '26px', fontWeight: 300,
            color: netIncome >= 0 ? 'var(--admin-success)' : 'var(--admin-danger)',
          }}>
            {yen(netIncome)}
          </span>
        </div>
      </div>

      {/* 注意書き */}
      <div style={{
        padding: '16px 20px', background: 'rgba(200,150,58,0.08)',
        border: '1px solid rgba(200,150,58,0.2)', borderRadius: '8px',
        fontSize: '12px', color: 'var(--admin-warning)', lineHeight: 1.8,
      }} className="no-print">
        <p>・副業収入は「雑所得」として申告してください。</p>
        <p>・年間損失の場合、損失申告が可能ですが翌年への繰越はできません（雑所得のため）。</p>
        <p>・このデータはあくまで参考値です。申告前に税理士への確認を推奨します。</p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .tax-page { color: black; }
        }
      `}</style>
    </div>
  )
}
