'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import MetricCard from '@/components/admin/MetricCard'
import GoalProgress from '@/components/admin/GoalProgress'

const MonthlyChart = dynamic(() => import('@/components/admin/MonthlyChart'), { ssr: false })

const FIXED_RENT = 31000
const GOAL_PROFIT = 500000
const GOAL_CUPS = 1000

type SaleItem = {
  date: string
  type: string
  quantity: number
  amount: number
  customers?: number
}

type ExpenseItem = {
  yearMonth: string
  id: string
  date: string
  category: string
  amount: number
  description: string
  allocationRate: number
  allocatedAmount: number
}

type InventoryItem = {
  beanId: string
  name: string
  currentStock: number
  alertThreshold: number
}

const CATEGORY_LABELS: Record<string, string> = {
  rent: '地代家賃', purchase: '仕入高', supplies: '消耗品費',
  communication: '通信費', advertising: '広告宣伝費', transport: '旅費交通費',
  outsourcing: '外注費', utilities: '水道光熱費', misc: '雑費',
}

function yen(n: number) {
  return `¥${n.toLocaleString()}`
}

function getMonthList(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${year}-${m}`
  })
}

export default function DashboardPage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [monthSales, setMonthSales] = useState<SaleItem[]>([])
  const [monthExpenses, setMonthExpenses] = useState<ExpenseItem[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [yearSales, setYearSales] = useState<Record<string, SaleItem[]>>({})
  const [yearExpenses, setYearExpenses] = useState<Record<string, ExpenseItem[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const months = getMonthList(currentYear)

      const [salesRes, expensesRes, inventoryRes, ...yearData] = await Promise.all([
        fetch(`/api/admin/sales?month=${currentMonth}`).then(r => r.json()),
        fetch(`/api/admin/expenses?yearMonth=${currentMonth}`).then(r => r.json()),
        fetch('/api/admin/inventory').then(r => r.json()),
        ...months.flatMap(m => [
          fetch(`/api/admin/sales?month=${m}`).then(r => r.json().then((d: SaleItem[]) => ({ m, type: 'sales', data: d }))),
          fetch(`/api/admin/expenses?yearMonth=${m}`).then(r => r.json().then((d: ExpenseItem[]) => ({ m, type: 'expenses', data: d }))),
        ]),
      ])

      setMonthSales(Array.isArray(salesRes) ? salesRes : [])
      setMonthExpenses(Array.isArray(expensesRes) ? expensesRes : [])
      setInventory(Array.isArray(inventoryRes) ? inventoryRes : [])

      const ys: Record<string, SaleItem[]> = {}
      const ye: Record<string, ExpenseItem[]> = {}
      for (const item of yearData as { m: string; type: string; data: SaleItem[] & ExpenseItem[] }[]) {
        if (item.type === 'sales') ys[item.m] = item.data
        else ye[item.m] = item.data
      }
      setYearSales(ys)
      setYearExpenses(ye)
      setLoading(false)
    }
    load()
  }, [currentMonth, currentYear])

  const monthRevenue = useMemo(
    () => monthSales.reduce((s, i) => s + i.amount, 0),
    [monthSales]
  )
  const monthExpenseTotal = useMemo(
    () => monthExpenses.reduce((s, i) => s + i.allocatedAmount, 0) + FIXED_RENT,
    [monthExpenses]
  )
  const monthProfit = monthRevenue - monthExpenseTotal

  const yearProfit = useMemo(() => {
    const months = getMonthList(currentYear)
    return months.reduce((total, m) => {
      const rev = (yearSales[m] ?? []).reduce((s: number, i: SaleItem) => s + i.amount, 0)
      const exp = (yearExpenses[m] ?? []).reduce((s: number, i: ExpenseItem) => s + i.allocatedAmount, 0) + FIXED_RENT
      return total + rev - exp
    }, 0)
  }, [yearSales, yearExpenses, currentYear])

  const yearCups = useMemo(() => {
    const months = getMonthList(currentYear)
    return months.reduce((total, m) => {
      return total + (yearSales[m] ?? [])
        .filter((i: SaleItem) => i.type === 'drink')
        .reduce((s: number, i: SaleItem) => s + (i.quantity ?? 0), 0)
    }, 0)
  }, [yearSales, currentYear])

  const weeksLeft = Math.max(1, Math.ceil(
    (new Date(currentYear, 11, 31).getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
  ))
  const cupsNeeded = Math.ceil((GOAL_CUPS - yearCups) / weeksLeft)

  // 月次グラフデータ
  const chartData = useMemo(() => {
    const months = getMonthList(currentYear)
    const labels = months.map(m => `${parseInt(m.split('-')[1])}月`)
    const profits = months.map(m => {
      const rev = (yearSales[m] ?? []).reduce((s: number, i: SaleItem) => s + i.amount, 0)
      const exp = (yearExpenses[m] ?? []).reduce((s: number, i: ExpenseItem) => s + i.allocatedAmount, 0) + FIXED_RENT
      return rev - exp
    })
    return { labels, profits }
  }, [yearSales, yearExpenses, currentYear])

  // 今月の経費内訳
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = { rent: FIXED_RENT }
    for (const e of monthExpenses) {
      map[e.category] = (map[e.category] ?? 0) + e.allocatedAmount
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .filter(([, v]) => v > 0)
  }, [monthExpenses])

  const goalItems = [
    {
      label: '黒字化目標',
      current: Math.max(0, yearProfit),
      goal: GOAL_PROFIT,
      unit: '円',
      alert: yearProfit < 0 ? `現在 ${yen(yearProfit)}` : undefined,
    },
    {
      label: '年間杯数',
      current: yearCups,
      goal: GOAL_CUPS,
      unit: '杯',
      alert: yearCups < GOAL_CUPS && cupsNeeded > 0
        ? `週 ${cupsNeeded} 杯ペースが必要（残 ${weeksLeft} 週）`
        : undefined,
    },
  ]

  const alertStock = inventory.filter(i => i.currentStock <= i.alertThreshold)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: 'var(--dim)', fontSize: '13px', letterSpacing: '0.10em' }}>読み込み中...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em', marginBottom: '28px', color: 'var(--cream)' }}>
        ダッシュボード
        <span style={{ fontSize: '11px', color: 'var(--dim)', marginLeft: '12px' }}>
          {currentYear}年{now.getMonth() + 1}月
        </span>
      </h2>

      {/* 上段メトリクス */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <MetricCard
          label="今月の売上"
          value={yen(monthRevenue)}
          sub={`${monthSales.filter(s => s.type === 'drink').reduce((s, i) => s + (i.quantity ?? 0), 0)} 杯`}
        />
        <MetricCard
          label="今月の支出"
          value={yen(monthExpenseTotal)}
          sub={`家賃含む`}
        />
        <MetricCard
          label="今月の損益"
          value={yen(monthProfit)}
          color={monthProfit >= 0 ? 'success' : 'danger'}
        />
        <MetricCard
          label="年間累計損益"
          value={yen(yearProfit)}
          color={yearProfit >= 0 ? 'success' : 'danger'}
          sub={`${currentYear}年 累計`}
        />
      </div>

      {/* 中段 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(260px, 300px)', gap: '16px', marginBottom: '24px' }}>
        <MonthlyChart labels={chartData.labels} profits={chartData.profits} />
        <GoalProgress items={goalItems} />
      </div>

      {/* 下段 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* 在庫サマリー */}
        <div style={{
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          padding: '20px 24px',
        }}>
          <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '16px' }}>
            在庫状況
          </p>
          {inventory.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--dim)' }}>登録なし</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {inventory.map(item => {
                const low = item.currentStock <= item.alertThreshold
                return (
                  <div key={item.beanId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--cream)' }}>{item.name}</span>
                    <span style={{
                      fontSize: '13px',
                      color: low ? 'var(--admin-danger)' : 'var(--cream)',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      {low && <span style={{ fontSize: '10px', background: 'var(--admin-danger)', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>残少</span>}
                      {item.currentStock.toLocaleString()} g
                    </span>
                  </div>
                )
              })}
              {alertStock.length > 0 && (
                <p style={{ fontSize: '11px', color: 'var(--admin-danger)', marginTop: '4px' }}>
                  ⚠ {alertStock.length}種が閾値以下
                </p>
              )}
            </div>
          )}
        </div>

        {/* 経費内訳 */}
        <div style={{
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          padding: '20px 24px',
        }}>
          <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.12em', marginBottom: '16px' }}>
            今月の経費内訳
          </p>
          {expenseByCategory.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--dim)' }}>記録なし</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {expenseByCategory.map(([cat, amount]) => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--dim)' }}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--cream)' }}>{yen(amount)}</span>
                </div>
              ))}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                borderTop: '1px solid var(--admin-border)', paddingTop: '8px', marginTop: '4px',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--cream)' }}>合計</span>
                <span style={{ fontSize: '13px', color: 'var(--cream)', fontWeight: 400 }}>{yen(monthExpenseTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
