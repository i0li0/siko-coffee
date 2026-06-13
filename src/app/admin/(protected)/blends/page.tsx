'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BlendAdminItem } from '@/types/admin'

const RATIO_COLORS = ['var(--admin-accent)', 'var(--admin-warning)', 'var(--admin-success)']

function RatioBar({ ratios }: { ratios: number[] }) {
  const total = ratios.reduce((a, b) => a + b, 0) || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '120px' }}>
      <div style={{ display: 'flex', height: '7px', borderRadius: '4px', overflow: 'hidden', background: 'var(--admin-sidebar-bg)' }}>
        {ratios.map((r, i) => (
          <div key={i} style={{ width: `${(r / total) * 100}%`, background: RATIO_COLORS[i % RATIO_COLORS.length] }} />
        ))}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--dim)' }}>{ratios.join(' / ')}</div>
    </div>
  )
}

export default function BlendsPage() {
  const [blends, setBlends] = useState<BlendAdminItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'published' | 'unpublished'>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/blends')
      .then(r => r.json())
      .then((data) => setBlends(Array.isArray(data) ? data : []))
      .catch(() => setBlends([]))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    all: blends.length,
    published: blends.filter(b => b.publish).length,
    unpublished: blends.filter(b => !b.publish).length,
  }), [blends])

  const visible = useMemo(() => blends.filter(b => {
    if (filter === 'published') return b.publish
    if (filter === 'unpublished') return !b.publish
    return true
  }), [blends, filter])

  async function togglePublish(b: BlendAdminItem) {
    const next = !b.publish
    setBusyId(b.id)
    setBlends(prev => prev.map(x => x.id === b.id ? { ...x, publish: next } : x))
    try {
      const res = await fetch(`/api/admin/blends/${b.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publish: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setBlends(prev => prev.map(x => x.id === b.id ? { ...x, publish: !next } : x))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(b: BlendAdminItem) {
    if (!confirm(`ブレンド「${b.name}」（${b.by}）を削除しますか？`)) return
    setBlends(prev => prev.filter(x => x.id !== b.id))
    await fetch(`/api/admin/blends/${b.id}`, { method: 'DELETE' })
  }

  const th: React.CSSProperties = {
    fontSize: '10px', color: 'var(--dim)', letterSpacing: '0.12em',
    padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--admin-border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '14px', borderBottom: '1px solid var(--admin-border)', fontSize: '13px', color: 'var(--cream)', verticalAlign: 'top',
  }
  const filterBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', background: active ? 'rgba(240,235,224,0.06)' : 'transparent',
    border: `1px solid ${active ? 'var(--admin-accent)' : 'var(--admin-border)'}`, borderRadius: '6px',
    color: active ? 'var(--cream)' : 'var(--dim)', fontSize: '12px', cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>ブレンド管理</h2>
        <button
          onClick={load}
          style={{
            padding: '7px 16px', background: 'transparent', border: '1px solid var(--admin-border)',
            borderRadius: '6px', color: 'var(--dim)', fontSize: '12px', cursor: 'pointer',
          }}
        >
          再読み込み
        </button>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} style={filterBtn(filter === 'all')}>すべて <span style={{ color: 'var(--dim)' }}>{counts.all}</span></button>
        <button onClick={() => setFilter('published')} style={filterBtn(filter === 'published')}>公開中 <span style={{ color: 'var(--dim)' }}>{counts.published}</span></button>
        <button onClick={() => setFilter('unpublished')} style={filterBtn(filter === 'unpublished')}>非公開 <span style={{ color: 'var(--dim)' }}>{counts.unpublished}</span></button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--dim)', fontSize: '13px' }}>読み込み中...</p>
      ) : visible.length === 0 ? (
        <div style={{
          background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
          borderRadius: '8px', padding: '40px', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--dim)', fontSize: '13px' }}>該当するブレンドはありません</p>
        </div>
      ) : (
        <div style={{
          background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)',
          borderRadius: '8px', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ブレンド名 / 投稿者</th>
                <th style={th}>比率</th>
                <th style={{ ...th, textAlign: 'right' }}>購入数</th>
                <th style={th}>コメント</th>
                <th style={{ ...th, textAlign: 'center' }}>公開</th>
                <th style={{ ...th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(b => {
                const busy = busyId === b.id
                return (
                  <tr key={b.id}>
                    <td style={td}>
                      <div style={{ fontSize: '14px' }}>{b.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '3px' }}>by {b.by}</div>
                      {b.createdAt && (
                        <div style={{ fontSize: '10px', color: 'var(--dim)', marginTop: '2px' }}>
                          {new Date(b.createdAt).toLocaleDateString('ja-JP')}
                        </div>
                      )}
                    </td>
                    <td style={td}><RatioBar ratios={b.ratios} /></td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.bought.toLocaleString()}</td>
                    <td style={{ ...td, maxWidth: '240px', color: b.comment ? 'var(--cream)' : 'var(--dim)', fontSize: '12px' }}>
                      {b.comment || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        onClick={() => togglePublish(b)}
                        disabled={busy}
                        title="クリックで公開/非公開を切替"
                        style={{
                          padding: '4px 11px', borderRadius: '4px', fontSize: '11px',
                          cursor: busy ? 'not-allowed' : 'pointer', background: 'transparent',
                          border: `1px solid ${b.publish ? 'var(--admin-success)' : 'var(--admin-border)'}`,
                          color: b.publish ? 'var(--admin-success)' : 'var(--dim)',
                        }}
                      >
                        {b.publish ? '公開中' : '非公開'}
                      </button>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(b)}
                        style={{ background: 'none', border: 'none', color: 'var(--admin-danger)', cursor: 'pointer', fontSize: '12px' }}
                      >
                        削除
                      </button>
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
