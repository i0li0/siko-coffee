'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OrderRecord, OrderItemRecord, OrderStatus } from '@/types/admin'
import { CARRIERS, carrierLabel } from '@/lib/carriers'

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  pending:    { label: '未決済',     color: 'var(--dim)' },
  paid:       { label: '支払済',     color: 'var(--admin-success)' },
  processing: { label: '準備中',     color: 'var(--admin-warning)' },
  shipped:    { label: '発送済',     color: 'var(--admin-accent)' },
  delivered:  { label: '配達完了',   color: 'var(--admin-success)' },
  cancelled:  { label: 'キャンセル', color: 'var(--dim)' },
  refunded:   { label: '返金済',     color: 'var(--admin-danger)' },
}

// 各ステータスから遷移可能な次ステータス（サーバ側 TRANSITIONS のミラー）
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending:    [],
  paid:       ['processing', 'shipped', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped:    ['delivered', 'refunded'],
  delivered:  ['refunded'],
  cancelled:  [],
  refunded:   [],
}

const TABS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all',        label: 'すべて' },
  { key: 'paid',       label: '支払済' },
  { key: 'processing', label: '準備中' },
  { key: 'shipped',    label: '発送済' },
  { key: 'delivered',  label: '配達完了' },
  { key: 'cancelled',  label: 'キャンセル' },
  { key: 'refunded',   label: '返金済' },
]

function itemSummary(item: OrderItemRecord): string {
  const grams = item.grams ?? 200
  const grind = item.grind ?? '豆のまま'
  const tag = item.single ? 'シングル' : item.custom ? 'オリジナル' : 'ブレンド'
  return `${item.name}（${tag}・${grind}・${grams}g）`
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.paid
  return (
    <span style={{
      fontSize: '11px', color: meta.color,
      border: `1px solid ${meta.color}`, borderRadius: '4px',
      padding: '3px 9px', letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | OrderStatus>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  // 発送フォーム（業者＋追跡番号の手入力）の対象注文
  const [shipForm, setShipForm] = useState<{ id: string; carrier: string; tracking: string } | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/orders')
      .then(r => r.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length }
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [orders])

  const visible = useMemo(
    () => (tab === 'all' ? orders : orders.filter(o => o.status === tab)),
    [orders, tab],
  )

  async function updateStatus(order: OrderRecord, next: OrderStatus, extra?: { carrier: string; trackingNumber: string }) {
    const meta = STATUS_META[next]
    if (next === 'refunded') {
      if (!confirm(`この注文を返金します。\nStripe で実際の返金処理が走ります。よろしいですか？`)) return
    } else if (next === 'cancelled') {
      if (!confirm('この注文をキャンセルしますか？')) return
    }
    setBusyId(order.id)
    setError('')
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, ...extra }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `更新に失敗しました（${meta.label}）`)
      }
      const updated = await res.json()
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...updated } : o)))
      setShipForm(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新に失敗しました')
    } finally {
      setBusyId(null)
    }
  }

  // 「発送済へ」を押したら、まず業者＋追跡番号の入力フォームを開く。
  function startShip(order: OrderRecord) {
    setError('')
    setShipForm({ id: order.id, carrier: CARRIERS[0].id, tracking: '' })
  }

  function submitShip(order: OrderRecord) {
    if (!shipForm) return
    if (!shipForm.tracking.trim()) {
      setError('追跡番号を入力してください')
      return
    }
    updateStatus(order, 'shipped', { carrier: shipForm.carrier, trackingNumber: shipForm.tracking.trim() })
  }

  const th: React.CSSProperties = {
    fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.12em',
    padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--admin-border)',
    whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '14px', borderBottom: '1px solid var(--admin-border)',
    fontSize: '13px', color: 'var(--cream)', verticalAlign: 'top',
  }

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>注文管理</h2>
        <button
          onClick={load}
          style={{
            padding: '7px 16px', background: 'transparent',
            border: '1px solid var(--admin-border)', borderRadius: '6px',
            color: 'var(--dim)', fontSize: '12px', cursor: 'pointer',
          }}
        >
          再読み込み
        </button>
      </div>

      {/* ステータスタブ */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(({ key, label }) => {
          const active = tab === key
          const count = counts[key] ?? 0
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '7px 14px',
                background: active ? 'rgba(240,235,224,0.06)' : 'transparent',
                border: `1px solid ${active ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
                borderRadius: '6px',
                color: active ? 'var(--cream)' : 'var(--dim)',
                fontSize: '12px', letterSpacing: '0.05em', cursor: 'pointer',
              }}
            >
              {label}
              <span style={{ marginLeft: '6px', color: 'var(--dim)', fontSize: '11px' }}>{count}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: '12px', color: 'var(--admin-danger)', marginBottom: '14px' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: 'var(--dim)', fontSize: '13px' }}>読み込み中...</p>
      ) : visible.length === 0 ? (
        <div style={{
          background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
          borderRadius: '8px', padding: '40px', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--dim)', fontSize: '13px' }}>該当する注文はありません</p>
        </div>
      ) : (
        <div style={{
          background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
          borderRadius: '8px', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>日時</th>
                <th style={th}>顧客</th>
                <th style={th}>内容</th>
                <th style={{ ...th, textAlign: 'right' }}>金額</th>
                <th style={th}>ステータス</th>
                <th style={{ ...th, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(order => {
                const nexts = NEXT[order.status] ?? []
                const busy = busyId === order.id
                return (
                  <tr key={order.id}>
                    <td style={td}>
                      <span style={{ fontSize: '12px' }}>
                        {new Date(order.paidAt ?? order.createdAt).toLocaleString('ja-JP', {
                          timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <div style={{ fontSize: '10px', color: 'var(--dim)', marginTop: '3px' }}>
                        #{order.id.slice(0, 8)}
                      </div>
                    </td>
                    <td style={td}>
                      <div>{order.customerName || order.shippingName || '—'}</div>
                      {order.customerEmail && (
                        <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                          {order.customerEmail}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: '200px' }}>
                      {(order.items ?? []).map((it, i) => (
                        <div key={i} style={{ fontSize: '12px', marginBottom: i < order.items.length - 1 ? '4px' : 0 }}>
                          {itemSummary(it)}
                          {it.custom && it.publish && (
                            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--admin-warning)' }}>★公開</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      ¥{(order.amount ?? 0).toLocaleString()}
                    </td>
                    <td style={td}>
                      <StatusBadge status={order.status} />
                      {order.trackingNumber && (
                        <div style={{ fontSize: '10px', color: 'var(--dim)', marginTop: '5px' }}>
                          {carrierLabel(order.carrier)}
                          <br />
                          {order.trackingUrl ? (
                            <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer"
                              style={{ color: 'var(--admin-accent)' }}>
                              {order.trackingNumber}
                            </a>
                          ) : (
                            order.trackingNumber
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {nexts.length === 0 ? (
                        <span style={{ fontSize: '11px', color: 'var(--dim)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {nexts.map(ns => {
                            const danger = ns === 'refunded' || ns === 'cancelled'
                            return (
                              <button
                                key={ns}
                                onClick={() => (ns === 'shipped' ? startShip(order) : updateStatus(order, ns))}
                                disabled={busy}
                                style={{
                                  padding: '5px 11px',
                                  background: 'transparent',
                                  border: `1px solid ${danger ? 'var(--admin-danger)' : 'var(--admin-border)'}`,
                                  borderRadius: '4px',
                                  color: busy ? 'var(--dim)' : danger ? 'var(--admin-danger)' : 'var(--admin-accent)',
                                  fontSize: '11px', cursor: busy ? 'not-allowed' : 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {STATUS_META[ns].label}へ
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {shipForm?.id === order.id && (
                        <div style={{
                          marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px',
                          alignItems: 'flex-end',
                        }}>
                          <select
                            value={shipForm.carrier}
                            onChange={(e) => setShipForm({ ...shipForm, carrier: e.target.value })}
                            style={{
                              padding: '5px 8px', background: 'var(--admin-card-bg)',
                              border: '1px solid var(--admin-border)', borderRadius: '4px',
                              color: 'var(--cream)', fontSize: '11px',
                            }}
                          >
                            {CARRIERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                          <input
                            value={shipForm.tracking}
                            onChange={(e) => setShipForm({ ...shipForm, tracking: e.target.value })}
                            placeholder="追跡番号"
                            style={{
                              padding: '5px 8px', background: 'var(--admin-card-bg)',
                              border: '1px solid var(--admin-border)', borderRadius: '4px',
                              color: 'var(--cream)', fontSize: '11px', width: '140px',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => setShipForm(null)}
                              disabled={busy}
                              style={{
                                padding: '5px 11px', background: 'transparent',
                                border: '1px solid var(--admin-border)', borderRadius: '4px',
                                color: 'var(--dim)', fontSize: '11px', cursor: 'pointer',
                              }}
                            >
                              取消
                            </button>
                            <button
                              onClick={() => submitShip(order)}
                              disabled={busy}
                              style={{
                                padding: '5px 11px', background: 'transparent',
                                border: '1px solid var(--admin-accent)', borderRadius: '4px',
                                color: busy ? 'var(--dim)' : 'var(--admin-accent)',
                                fontSize: '11px', cursor: busy ? 'not-allowed' : 'pointer',
                              }}
                            >
                              発送を確定
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
