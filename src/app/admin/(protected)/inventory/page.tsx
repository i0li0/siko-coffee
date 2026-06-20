'use client'

import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem, InventoryCategory, CoffeeStockType } from '@/types/admin'

type PurchaseForm = {
  date: string
  beanId: string
  name: string
  origin: string
  purchaseKg: string
  purchasePrice: string
  alertThreshold: string
  category: InventoryCategory
  stockType: CoffeeStockType
  unit: string
  recordExpense: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

function emptyForm(category: InventoryCategory = 'coffee'): PurchaseForm {
  return {
    date: today(), beanId: '', name: '', origin: '', purchaseKg: '', purchasePrice: '', alertThreshold: '500',
    category, stockType: 'green', unit: category === 'supply' ? '個' : 'g', recordExpense: true,
  }
}

const STOCK_TYPE_LABEL: Record<CoffeeStockType, string> = { green: '生豆', roasted: '焙煎豆' }

type EditingMeta = { beanId: string; name: string; origin: string; stockType: CoffeeStockType }

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PurchaseForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingStock, setEditingStock] = useState<{ beanId: string; value: string } | null>(null)
  const [editingItem, setEditingItem] = useState<EditingMeta | null>(null)
  const [tab, setTab] = useState<InventoryCategory>('coffee')

  function loadInventory() {
    setLoading(true)
    fetch('/api/admin/inventory')
      .then(r => r.json())
      .then((data: InventoryItem[]) => {
        setInventory(Array.isArray(data) ? data.sort((a, b) => a.name.localeCompare(b.name, 'ja')) : [])
      })
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadInventory() }, [])

  const filtered = useMemo(() => {
    return inventory.filter(i => (i.category ?? 'coffee') === tab)
  }, [inventory, tab])

  function openNewForm() {
    setForm(emptyForm(tab))
    setShowForm(true)
    setError('')
  }

  function openPurchaseForm(item: InventoryItem) {
    setForm({
      ...emptyForm(item.category ?? 'coffee'),
      beanId: item.beanId, name: item.name, origin: item.origin,
      alertThreshold: String(item.alertThreshold),
      stockType: item.stockType ?? 'green',
      unit: item.unit ?? 'g',
      recordExpense: true,
    })
    setShowForm(true)
    setError('')
  }

  async function handleSave() {
    if (!form.name || !form.purchaseKg) {
      setError('名前・数量は必須です')
      return
    }
    if (form.recordExpense && !form.purchasePrice) {
      setError('経費計上する場合は金額が必須です')
      return
    }
    setSaving(true)
    setError('')
    try {
      const purchaseAmount = form.category === 'coffee'
        ? Math.round(Number(form.purchaseKg) * 1000)
        : Number(form.purchaseKg)

      const invRes = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beanId: form.beanId || undefined,
          name: form.name,
          origin: form.origin,
          purchaseAmount,
          alertThreshold: Number(form.alertThreshold) || 500,
          category: form.category,
          stockType: form.category === 'coffee' ? form.stockType : undefined,
          unit: form.unit || undefined,
        }),
      })
      if (!invRes.ok) throw new Error()

      if (form.recordExpense && form.purchasePrice) {
        const price = Number(form.purchasePrice)
        const expCategory = form.category === 'coffee' ? 'purchase' : 'supplies'
        const desc = form.category === 'coffee'
          ? `仕入：${form.name} ${form.purchaseKg}kg（${STOCK_TYPE_LABEL[form.stockType]}）`
          : `資材：${form.name} ${form.purchaseKg}${form.unit}`

        await fetch('/api/admin/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: form.date,
            category: expCategory,
            amount: price,
            description: desc,
            allocationRate: 1,
          }),
        })
      }

      setShowForm(false)
      loadInventory()
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleStockUpdate(beanId: string, value: string) {
    const stock = Number(value)
    if (isNaN(stock) || stock < 0) return
    await fetch('/api/admin/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanId, currentStock: stock }),
    })
    setInventory(prev => prev.map(i => i.beanId === beanId ? { ...i, currentStock: stock } : i))
    setEditingStock(null)
  }

  async function handleItemUpdate() {
    if (!editingItem || !editingItem.name) return
    const { beanId, name, origin, stockType } = editingItem
    await fetch('/api/admin/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanId, name, origin, stockType }),
    })
    setInventory(prev => prev.map(i => i.beanId === beanId ? { ...i, name, origin, stockType } : i))
    setEditingItem(null)
  }

  async function handleDelete(beanId: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return
    await fetch(`/api/admin/inventory?beanId=${beanId}`, { method: 'DELETE' })
    setInventory(prev => prev.filter(i => i.beanId !== beanId))
  }

  const inputStyle = {
    background: 'var(--admin-sidebar-bg)',
    border: '1px solid var(--admin-border)',
    borderRadius: '6px', padding: '9px 12px',
    color: 'var(--cream)', fontSize: '13px',
    fontFamily: 'var(--font-sans)', outline: 'none', width: '100%',
  }
  const labelStyle = {
    fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.10em',
    display: 'block' as const, marginBottom: '5px',
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', background: active ? 'rgba(240,235,224,0.06)' : 'transparent',
    border: `1px solid ${active ? 'var(--admin-accent)' : 'var(--admin-border)'}`, borderRadius: '6px',
    color: active ? 'var(--cream)' : 'var(--dim)', fontSize: '13px', cursor: 'pointer',
    letterSpacing: '0.06em',
  })

  const isCoffee = tab === 'coffee'
  const unitLabel = (item: InventoryItem) => item.unit ?? (item.category === 'supply' ? '個' : 'g')

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>在庫管理</h2>
        <button
          onClick={openNewForm}
          style={{
            padding: '9px 20px', background: 'var(--admin-accent)',
            border: 'none', borderRadius: '6px', color: '#0d0d14',
            fontSize: '13px', letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          + {isCoffee ? '豆を登録' : '資材を登録'}
        </button>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        <button onClick={() => { setTab('coffee'); setShowForm(false) }} style={tabBtn(tab === 'coffee')}>コーヒー豆</button>
        <button onClick={() => { setTab('supply'); setShowForm(false) }} style={tabBtn(tab === 'supply')}>資材</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showForm ? '1fr 340px' : '1fr', gap: '20px', alignItems: 'start' }}>

        {/* 在庫一覧 */}
        <div>
          {loading ? (
            <p style={{ color: 'var(--dim)', fontSize: '13px' }}>読み込み中...</p>
          ) : filtered.length === 0 ? (
            <div style={{
              background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
              borderRadius: '8px', padding: '40px', textAlign: 'center',
            }}>
              <p style={{ color: 'var(--dim)', fontSize: '13px', marginBottom: '16px' }}>
                {isCoffee ? '在庫が登録されていません' : '資材が登録されていません'}
              </p>
              <button
                onClick={openNewForm}
                style={{
                  padding: '8px 20px', background: 'transparent',
                  border: '1px solid var(--admin-border)', borderRadius: '6px',
                  color: 'var(--dim)', fontSize: '12px', cursor: 'pointer',
                }}
              >
                {isCoffee ? '最初の豆を登録する' : '最初の資材を登録する'}
              </button>
            </div>
          ) : (
            <div style={{
              background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
              borderRadius: '8px', overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      isCoffee ? '豆の名前' : '資材名',
                      isCoffee ? '産地' : '',
                      isCoffee ? '種別' : '',
                      '現在の在庫', '閾値', '最終更新', '',
                    ].filter(Boolean).map((h, i) => (
                      <th key={i} style={{
                        fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.12em',
                        padding: '10px 14px',
                        textAlign: (h === '現在の在庫' || h === '閾値') ? 'right' : 'left' as 'left' | 'right',
                        borderBottom: '1px solid var(--admin-border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const low = item.currentStock <= item.alertThreshold
                    const isEditing = editingStock?.beanId === item.beanId
                    const isEditingMeta = editingItem?.beanId === item.beanId
                    const u = unitLabel(item)
                    return (
                      <tr key={item.beanId}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--admin-border)' }}>
                          {isEditingMeta ? (
                            <input
                              value={editingItem.name}
                              onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                              style={{ ...inputStyle, padding: '4px 8px' }}
                            />
                          ) : (
                            <span
                              style={{ fontSize: '14px', color: 'var(--cream)', cursor: 'pointer' }}
                              onClick={() => setEditingItem({ beanId: item.beanId, name: item.name, origin: item.origin, stockType: item.stockType ?? 'green' })}
                              title="クリックで編集"
                            >
                              {item.name}
                            </span>
                          )}
                        </td>
                        {isCoffee && (
                          <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--dim)', borderBottom: '1px solid var(--admin-border)' }}>
                            {isEditingMeta ? (
                              <input
                                value={editingItem.origin}
                                onChange={e => setEditingItem({ ...editingItem, origin: e.target.value })}
                                style={{ ...inputStyle, padding: '4px 8px' }}
                              />
                            ) : (
                              item.origin || '—'
                            )}
                          </td>
                        )}
                        {isCoffee && (
                          <td style={{ padding: '12px 14px', fontSize: '12px', borderBottom: '1px solid var(--admin-border)' }}>
                            {isEditingMeta ? (
                              <select
                                value={editingItem.stockType}
                                onChange={e => setEditingItem({ ...editingItem, stockType: e.target.value as CoffeeStockType })}
                                style={{ ...inputStyle, width: '90px', padding: '4px 6px', fontSize: '11px' }}
                              >
                                <option value="green">生豆</option>
                                <option value="roasted">焙煎豆</option>
                              </select>
                            ) : (
                              <span style={{
                                padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                                background: item.stockType === 'roasted' ? 'rgba(154,104,68,0.2)' : 'rgba(139,195,74,0.15)',
                                color: item.stockType === 'roasted' ? '#c49a6c' : '#9ccc65',
                              }}>
                                {STOCK_TYPE_LABEL[item.stockType ?? 'green']}
                              </span>
                            )}
                          </td>
                        )}
                        <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--admin-border)' }}>
                          {isEditing ? (
                            <input
                              type="number" min="0"
                              value={editingStock.value}
                              onChange={e => setEditingStock({ beanId: item.beanId, value: e.target.value })}
                              onBlur={() => handleStockUpdate(item.beanId, editingStock.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleStockUpdate(item.beanId, editingStock.value) }}
                              autoFocus
                              style={{ ...inputStyle, width: '90px', textAlign: 'right', padding: '5px 8px' }}
                            />
                          ) : (
                            <span
                              onClick={() => setEditingStock({ beanId: item.beanId, value: String(item.currentStock) })}
                              style={{
                                fontSize: '14px',
                                color: low ? 'var(--admin-danger)' : 'var(--cream)',
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
                              }}
                              title="クリックで編集"
                            >
                              {low && (
                                <span style={{
                                  fontSize: '9px', background: 'var(--admin-danger)', color: '#fff',
                                  padding: '2px 6px', borderRadius: '3px',
                                }}>残少</span>
                              )}
                              {item.currentStock.toLocaleString()} {u}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--dim)', textAlign: 'right', borderBottom: '1px solid var(--admin-border)' }}>
                          {item.alertThreshold.toLocaleString()} {u}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--dim)', borderBottom: '1px solid var(--admin-border)' }}>
                          {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('ja-JP') : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--admin-border)' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            {isEditingMeta ? (
                              <>
                                <button
                                  onClick={handleItemUpdate}
                                  style={{
                                    padding: '5px 12px', background: 'var(--admin-accent)',
                                    border: 'none', borderRadius: '4px',
                                    color: '#0d0d14', fontSize: '11px', cursor: 'pointer',
                                  }}
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => setEditingItem(null)}
                                  style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--dim)', cursor: 'pointer', fontSize: '11px',
                                  }}
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => openPurchaseForm(item)}
                                  style={{
                                    padding: '5px 12px', background: 'transparent',
                                    border: '1px solid var(--admin-border)', borderRadius: '4px',
                                    color: 'var(--admin-accent)', fontSize: '11px', cursor: 'pointer',
                                  }}
                                >
                                  {isCoffee ? '仕入れ' : '補充'}
                                </button>
                                <button
                                  onClick={() => handleDelete(item.beanId, item.name)}
                                  style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--admin-danger)', cursor: 'pointer', fontSize: '11px',
                                  }}
                                >
                                  削除
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 仕入れ / 登録フォーム */}
        {showForm && (
          <div style={{
            background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
            borderRadius: '8px', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--cream)' }}>
                {form.beanId
                  ? (isCoffee ? '仕入れ記録' : '補充記録')
                  : (isCoffee ? '新規豆を登録' : '新規資材を登録')}
              </p>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: '16px' }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>日付</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
              </div>

              {!form.beanId && (
                <>
                  <div>
                    <label style={labelStyle}>{isCoffee ? '豆の名前' : '資材名'} *</label>
                    <input
                      type="text" value={form.name}
                      placeholder={isCoffee ? '例: エチオピア イルガチェフェ' : '例: テイクアウトカップ 12oz'}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  {isCoffee && (
                    <div>
                      <label style={labelStyle}>産地</label>
                      <input
                        type="text" value={form.origin} placeholder="例: エチオピア"
                        onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  )}
                  {isCoffee && (
                    <div>
                      <label style={labelStyle}>種別</label>
                      <select value={form.stockType} onChange={e => setForm(f => ({ ...f, stockType: e.target.value as CoffeeStockType }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="green">生豆</option>
                        <option value="roasted">焙煎豆</option>
                      </select>
                    </div>
                  )}
                  {!isCoffee && (
                    <div>
                      <label style={labelStyle}>単位</label>
                      <input type="text" value={form.unit} placeholder="例: 個, 枚, パック"
                        onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={inputStyle} />
                    </div>
                  )}
                </>
              )}

              {form.beanId && (
                <div style={{ padding: '10px 12px', background: 'rgba(240,235,224,0.04)', borderRadius: '6px' }}>
                  {isCoffee && (
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', marginRight: '8px',
                      background: form.stockType === 'roasted' ? 'rgba(154,104,68,0.2)' : 'rgba(139,195,74,0.15)',
                      color: form.stockType === 'roasted' ? '#c49a6c' : '#9ccc65',
                    }}>
                      {STOCK_TYPE_LABEL[form.stockType]}
                    </span>
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--cream)' }}>{form.name}</span>
                  {form.origin && <p style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px' }}>{form.origin}</p>}
                </div>
              )}

              <div>
                <label style={labelStyle}>数量{isCoffee ? '（kg）' : `（${form.unit}）`} *</label>
                <input
                  type="number" min="0" step={isCoffee ? '0.1' : '1'} value={form.purchaseKg} placeholder="0"
                  onChange={e => setForm(f => ({ ...f, purchaseKg: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              {/* 経費計上トグル */}
              <div
                onClick={() => setForm(f => ({ ...f, recordExpense: !f.recordExpense }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: '6px',
                  background: form.recordExpense ? 'rgba(76,175,80,0.08)' : 'rgba(240,235,224,0.03)',
                  border: `1px solid ${form.recordExpense ? 'rgba(76,175,80,0.25)' : 'var(--admin-border)'}`,
                }}
              >
                <div style={{
                  width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                  border: `1.5px solid ${form.recordExpense ? '#81c784' : 'var(--dim)'}`,
                  background: form.recordExpense ? '#81c784' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', color: '#0d0d14', fontWeight: 700,
                }}>
                  {form.recordExpense ? '✓' : ''}
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--cream)' }}>経費に計上する</span>
                  <p style={{ fontSize: '10px', color: 'var(--dim)', marginTop: '2px' }}>
                    {form.recordExpense
                      ? (isCoffee ? '仕入高として経費テーブルに自動登録' : '消耗品費として経費テーブルに自動登録')
                      : '在庫のみ登録（既存在庫の初期入力など）'}
                  </p>
                </div>
              </div>

              {form.recordExpense && (
                <div>
                  <label style={labelStyle}>金額（円）*</label>
                  <input
                    type="number" min="0" value={form.purchasePrice} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              )}

              {!form.beanId && (
                <div>
                  <label style={labelStyle}>警告閾値（{isCoffee ? 'g' : form.unit}）</label>
                  <input
                    type="number" min="0" value={form.alertThreshold}
                    onChange={e => setForm(f => ({ ...f, alertThreshold: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              )}

              {form.purchaseKg && isCoffee && (
                <div style={{ fontSize: '11px', color: 'var(--dim)', padding: '8px 0' }}>
                  {Number(form.purchaseKg)} kg = {(Number(form.purchaseKg) * 1000).toLocaleString()} g
                  {form.recordExpense && form.purchasePrice && ` / ¥${Number(form.purchasePrice).toLocaleString()}`}
                </div>
              )}

              {error && <p style={{ fontSize: '12px', color: 'var(--admin-danger)' }}>{error}</p>}

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '11px', background: saving ? 'transparent' : 'var(--admin-accent)',
                  border: '1px solid var(--admin-accent)', borderRadius: '6px',
                  color: saving ? 'var(--dim)' : '#0d0d14',
                  fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '保存中...' : form.recordExpense ? '保存（経費に自動登録）' : '保存（在庫のみ）'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
