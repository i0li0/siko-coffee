'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Product, ProductStatus } from '@/types/product'

const TYPE_OPTIONS = [
  { key: 'bean',  label: '珈琲豆' },
  { key: 'drip',  label: 'ドリップバッグ' },
  { key: 'goods', label: 'グッズ' },
  { key: 'menu',  label: 'メニュー' },
] as const

const STATUS_OPTIONS: { key: ProductStatus; label: string; color: string }[] = [
  { key: 'active',       label: '販売中',   color: 'var(--admin-success)' },
  { key: 'paused',       label: '一時停止', color: 'var(--admin-warning, #e8a317)' },
  { key: 'discontinued', label: '販売終了', color: 'var(--admin-danger)' },
]

const STATUS_LABEL: Record<string, { label: string; color: string }> = Object.fromEntries(
  STATUS_OPTIONS.map(s => [s.key, { label: s.label, color: s.color }]),
)

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map(t => [t.key, t.label]),
)

type ProductForm = {
  id: string
  name: string
  nameJp: string
  price: string
  description: string
  type: string
  isPublic: boolean
  canCustomize: boolean
  status: ProductStatus
  recipe: string
  unit: string
  sortOrder: string
}

function emptyForm(): ProductForm {
  return { id: '', name: '', nameJp: '', price: '', description: '', type: 'bean', isPublic: true, canCustomize: false, status: 'active', recipe: '', unit: '', sortOrder: '' }
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all')
  const [publicFilter, setPublicFilter] = useState<'all' | 'public' | 'private'>('all')

  function load() {
    setLoading(true)
    fetch('/api/admin/products')
      .then(r => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  const visible = useMemo(() => products.filter(p => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false
    if (publicFilter === 'public' && !p.isPublic) return false
    if (publicFilter === 'private' && p.isPublic) return false
    return true
  }), [products, typeFilter, publicFilter])

  function openNew() {
    setForm(emptyForm())
    setShowForm(true)
    setError('')
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id, name: p.name, nameJp: p.nameJp ?? '', price: String(p.price),
      description: p.description ?? '', type: p.type, isPublic: p.isPublic, canCustomize: p.canCustomize,
      status: p.status ?? 'active', recipe: p.recipe ?? '', unit: p.unit ?? '', sortOrder: p.sortOrder !== undefined ? String(p.sortOrder) : '',
    })
    setShowForm(true)
    setError('')
  }

  async function handleSave() {
    if (!form.name || form.price === '' || !form.type) {
      setError('商品名・価格・タイプは必須です')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      name: form.name,
      nameJp: form.nameJp,
      price: Number(form.price),
      description: form.description,
      type: form.type,
      isPublic: form.isPublic,
      canCustomize: form.canCustomize,
      status: form.status,
      recipe: form.recipe || undefined,
      unit: form.unit || undefined,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : undefined,
    }
    try {
      const res = form.id
        ? await fetch(`/api/admin/products/${form.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/products', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error()
      setShowForm(false)
      load()
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function togglePublic(p: Product) {
    const next = !p.isPublic
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isPublic: next } : x))
    const res = await fetch(`/api/admin/products/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublic: next }),
    })
    if (!res.ok) setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isPublic: !next } : x))
  }

  async function handleDelete(p: Product) {
    if (!confirm(`「${p.nameJp || p.name}」を削除しますか？`)) return
    await fetch(`/api/admin/products/${p.id}`, { method: 'DELETE' })
    setProducts(prev => prev.filter(x => x.id !== p.id))
  }

  async function cycleStatus(p: Product) {
    const order: ProductStatus[] = ['active', 'paused', 'discontinued']
    const cur = p.status ?? 'active'
    const next = order[(order.indexOf(cur) + 1) % order.length]
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x))
    const res = await fetch(`/api/admin/products/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
    })
    if (!res.ok) setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: cur } : x))
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--admin-sidebar-bg)', border: '1px solid var(--admin-border)',
    borderRadius: '6px', padding: '9px 12px', color: 'var(--cream)', fontSize: '13px',
    fontFamily: 'var(--font-sans)', outline: 'none', width: '100%',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.10em', display: 'block', marginBottom: '5px',
  }
  const th: React.CSSProperties = {
    fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.12em',
    padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--admin-border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid var(--admin-border)', fontSize: '13px', color: 'var(--cream)',
  }

  const filterBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 13px', background: active ? 'rgba(240,235,224,0.06)' : 'transparent',
    border: `1px solid ${active ? 'var(--admin-accent)' : 'var(--admin-border)'}`, borderRadius: '6px',
    color: active ? 'var(--cream)' : 'var(--dim)', fontSize: '12px', cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: '1040px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>商品管理</h2>
        <button
          onClick={openNew}
          style={{
            padding: '9px 20px', background: 'var(--admin-accent)', border: 'none', borderRadius: '6px',
            color: '#0d0d14', fontSize: '13px', letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          + 商品を追加
        </button>
      </div>

      {/* フィルタ */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button onClick={() => setTypeFilter('all')} style={filterBtn(typeFilter === 'all')}>すべて</button>
          {TYPE_OPTIONS.map(t => (
            <button key={t.key} onClick={() => setTypeFilter(t.key)} style={filterBtn(typeFilter === t.key)}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setPublicFilter('all')} style={filterBtn(publicFilter === 'all')}>公開/非公開</button>
          <button onClick={() => setPublicFilter('public')} style={filterBtn(publicFilter === 'public')}>公開のみ</button>
          <button onClick={() => setPublicFilter('private')} style={filterBtn(publicFilter === 'private')}>非公開のみ</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showForm ? '1fr 340px' : '1fr', gap: '20px', alignItems: 'start' }}>
        <div>
          {loading ? (
            <p style={{ color: 'var(--dim)', fontSize: '13px' }}>読み込み中...</p>
          ) : visible.length === 0 ? (
            <div style={{
              background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
              borderRadius: '8px', padding: '40px', textAlign: 'center',
            }}>
              <p style={{ color: 'var(--dim)', fontSize: '13px' }}>該当する商品はありません</p>
            </div>
          ) : (
            <div style={{
              background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
              borderRadius: '8px', overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>商品名</th>
                    <th style={th}>タイプ</th>
                    <th style={{ ...th, textAlign: 'right' }}>価格</th>
                    <th style={{ ...th, textAlign: 'center' }}>ステータス</th>
                    <th style={{ ...th, textAlign: 'center' }}>公開</th>
                    <th style={{ ...th, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(p => (
                    <tr key={p.id}>
                      <td style={td}>
                        <div style={{ fontSize: '14px' }}>{p.nameJp || p.name}</div>
                        {p.nameJp && p.name && (
                          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>{p.name}</div>
                        )}
                      </td>
                      <td style={{ ...td, color: 'var(--dim)' }}>{TYPE_LABEL[p.type] ?? p.type}</td>
                      <td style={{ ...td, textAlign: 'right' }}>¥{p.price.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {(() => {
                          const s = STATUS_LABEL[p.status ?? 'active'] ?? STATUS_LABEL.active
                          return (
                            <button
                              onClick={() => cycleStatus(p)}
                              title="クリックで切替"
                              style={{
                                padding: '3px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                                background: 'transparent',
                                border: `1px solid ${s.color}`,
                                color: s.color,
                              }}
                            >
                              {s.label}
                            </button>
                          )
                        })()}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button
                          onClick={() => togglePublic(p)}
                          title="クリックで切替"
                          style={{
                            padding: '3px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                            background: 'transparent',
                            border: `1px solid ${p.isPublic ? 'var(--admin-success)' : 'var(--admin-border)'}`,
                            color: p.isPublic ? 'var(--admin-success)' : 'var(--dim)',
                          }}
                        >
                          {p.isPublic ? '公開中' : '非公開'}
                        </button>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => openEdit(p)}
                            style={{ background: 'none', border: 'none', color: 'var(--admin-accent)', cursor: 'pointer', fontSize: '12px' }}
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            style={{ background: 'none', border: 'none', color: 'var(--admin-danger)', cursor: 'pointer', fontSize: '12px' }}
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 追加・編集フォーム */}
        {showForm && (
          <div style={{
            background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
            borderRadius: '8px', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--cream)' }}>{form.id ? '商品を編集' : '商品を追加'}</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: '16px' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>商品名（英）*</label>
                <input type="text" value={form.name} placeholder="例: Ethiopia Yirgacheffe"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>商品名（和）</label>
                <input type="text" value={form.nameJp} placeholder="例: エチオピア イルガチェフェ"
                  onChange={e => setForm(f => ({ ...f, nameJp: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>価格（円）*</label>
                  <input type="number" min="0" value={form.price} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>タイプ *</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}>
                    {TYPE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>説明</label>
                <textarea value={form.description} rows={3} placeholder="商品説明"
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div>
                <label style={labelStyle}>ステータス *</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ProductStatus }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  {STATUS_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>レシピ</label>
                  <input type="text" value={form.recipe} placeholder="例: 豆20g → 200ml"
                    onChange={e => setForm(f => ({ ...f, recipe: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>単位</label>
                  <input type="text" value={form.unit} placeholder="例: 100g"
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>表示順（小さいほど上）</label>
                <input type="number" value={form.sortOrder} placeholder="自動"
                  onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} style={inputStyle} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--cream)' }}>
                <input type="checkbox" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} />
                ショップに公開する
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--cream)' }}>
                <input type="checkbox" checked={form.canCustomize} onChange={e => setForm(f => ({ ...f, canCustomize: e.target.checked }))} />
                カスタマイズ可（ブレンド工房対象）
              </label>

              {error && <p style={{ fontSize: '12px', color: 'var(--admin-danger)' }}>{error}</p>}

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '11px', background: saving ? 'transparent' : 'var(--admin-accent)',
                  border: '1px solid var(--admin-accent)', borderRadius: '6px',
                  color: saving ? 'var(--dim)' : '#0d0d14', fontSize: '13px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '保存中...' : form.id ? '更新する' : '追加する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
