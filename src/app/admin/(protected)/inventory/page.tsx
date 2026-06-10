'use client'

import { useEffect, useState } from 'react'
import type { InventoryItem } from '@/types/admin'

type PurchaseForm = {
  date: string
  beanId: string        // 空なら新規
  name: string
  origin: string
  purchaseKg: string
  purchasePrice: string
  alertThreshold: string
}

const today = () => new Date().toISOString().slice(0, 10)

function emptyForm(): PurchaseForm {
  return { date: today(), beanId: '', name: '', origin: '', purchaseKg: '', purchasePrice: '', alertThreshold: '500' }
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PurchaseForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingStock, setEditingStock] = useState<{ beanId: string; value: string } | null>(null)

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

  function openNewForm() {
    setForm(emptyForm())
    setShowForm(true)
    setError('')
  }

  function openPurchaseForm(item: InventoryItem) {
    setForm({ ...emptyForm(), beanId: item.beanId, name: item.name, origin: item.origin, alertThreshold: String(item.alertThreshold) })
    setShowForm(true)
    setError('')
  }

  async function handleSave() {
    if (!form.name || !form.purchaseKg || !form.purchasePrice) {
      setError('豆の名前・購入量・金額は必須です')
      return
    }
    setSaving(true)
    setError('')
    try {
      const purchaseGrams = Math.round(Number(form.purchaseKg) * 1000)
      const price = Number(form.purchasePrice)
      // 在庫を更新（新規 or 加算）
      const invRes = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beanId: form.beanId || undefined,
          name: form.name,
          origin: form.origin,
          purchaseAmount: purchaseGrams,
          alertThreshold: Number(form.alertThreshold) || 500,
        }),
      })
      if (!invRes.ok) throw new Error()

      // 仕入費用を経費テーブルへ自動登録
      await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          category: 'purchase',
          amount: price,
          description: `仕入：${form.name} ${form.purchaseKg}kg`,
          allocationRate: 1,
        }),
      })

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
    display: 'block', marginBottom: '5px',
  }

  return (
    <div style={{ maxWidth: '900px' }}>
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
          + 新規豆を登録
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showForm ? '1fr 320px' : '1fr', gap: '20px', alignItems: 'start' }}>

        {/* 在庫一覧 */}
        <div>
          {loading ? (
            <p style={{ color: 'var(--dim)', fontSize: '13px' }}>読み込み中...</p>
          ) : inventory.length === 0 ? (
            <div style={{
              background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
              borderRadius: '8px', padding: '40px', textAlign: 'center',
            }}>
              <p style={{ color: 'var(--dim)', fontSize: '13px', marginBottom: '16px' }}>
                在庫が登録されていません
              </p>
              <button
                onClick={openNewForm}
                style={{
                  padding: '8px 20px', background: 'transparent',
                  border: '1px solid var(--admin-border)', borderRadius: '6px',
                  color: 'var(--dim)', fontSize: '12px', cursor: 'pointer',
                }}
              >
                最初の豆を登録する
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
                    {['豆の名前', '産地', '現在の在庫', '閾値', '最終更新', ''].map((h, i) => (
                      <th key={i} style={{
                        fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.12em',
                        padding: '10px 14px', textAlign: i >= 2 && i <= 3 ? 'right' : 'left' as 'left' | 'right',
                        borderBottom: '1px solid var(--admin-border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => {
                    const low = item.currentStock <= item.alertThreshold
                    const isEditing = editingStock?.beanId === item.beanId
                    return (
                      <tr key={item.beanId}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--admin-border)' }}>
                          <span style={{ fontSize: '14px', color: 'var(--cream)' }}>{item.name}</span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--dim)', borderBottom: '1px solid var(--admin-border)' }}>
                          {item.origin || '—'}
                        </td>
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
                              {item.currentStock.toLocaleString()} g
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--dim)', textAlign: 'right', borderBottom: '1px solid var(--admin-border)' }}>
                          {item.alertThreshold.toLocaleString()} g
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--dim)', borderBottom: '1px solid var(--admin-border)' }}>
                          {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('ja-JP') : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--admin-border)' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => openPurchaseForm(item)}
                              style={{
                                padding: '5px 12px', background: 'transparent',
                                border: '1px solid var(--admin-border)', borderRadius: '4px',
                                color: 'var(--admin-accent)', fontSize: '11px', cursor: 'pointer',
                              }}
                            >
                              仕入れ
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

        {/* 仕入れフォーム */}
        {showForm && (
          <div style={{
            background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
            borderRadius: '8px', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--cream)' }}>
                {form.beanId ? '仕入れ記録' : '新規豆を登録'}
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
                    <label style={labelStyle}>豆の名前 *</label>
                    <input
                      type="text" value={form.name} placeholder="例: エチオピア イルガチェフェ"
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>産地</label>
                    <input
                      type="text" value={form.origin} placeholder="例: エチオピア"
                      onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </>
              )}

              {form.beanId && (
                <div style={{ padding: '10px 12px', background: 'rgba(240,235,224,0.04)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--cream)' }}>{form.name}</p>
                  {form.origin && <p style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>{form.origin}</p>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>購入量（kg）*</label>
                  <input
                    type="number" min="0" step="0.1" value={form.purchaseKg} placeholder="0.0"
                    onChange={e => setForm(f => ({ ...f, purchaseKg: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>金額（円）*</label>
                  <input
                    type="number" min="0" value={form.purchasePrice} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              {!form.beanId && (
                <div>
                  <label style={labelStyle}>警告閾値（g）</label>
                  <input
                    type="number" min="0" value={form.alertThreshold}
                    onChange={e => setForm(f => ({ ...f, alertThreshold: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              )}

              {form.purchaseKg && (
                <div style={{ fontSize: '11px', color: 'var(--dim)', padding: '8px 0' }}>
                  {Number(form.purchaseKg)} kg = {(Number(form.purchaseKg) * 1000).toLocaleString()} g
                  {form.purchasePrice && ` / ¥${Number(form.purchasePrice).toLocaleString()}`}
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
                {saving ? '保存中...' : '保存（経費に自動登録）'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
