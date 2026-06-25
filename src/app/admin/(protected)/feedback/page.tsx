'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackStatus,
} from '@/lib/feedback'

type FeedbackRow = {
  feedbackId: string
  content: string
  source: keyof typeof FEEDBACK_SOURCE_LABELS
  category: keyof typeof FEEDBACK_CATEGORY_LABELS
  status: FeedbackStatus
  createdAt: string
}

const STATUS_TABS: { key: FeedbackStatus | 'all'; label: string }[] = [
  { key: 'new', label: '未読' },
  { key: 'read', label: '既読' },
  { key: 'archived', label: '対応済' },
  { key: 'all', label: 'すべて' },
]

const STATUS_BADGE: Record<FeedbackStatus, { label: string; color: string; bg: string }> = {
  new: { label: '未読', color: '#7Fd0a8', bg: 'rgba(127,208,168,0.12)' },
  read: { label: '既読', color: 'var(--dim)', bg: 'rgba(240,235,224,0.06)' },
  archived: { label: '対応済', color: 'var(--admin-accent)', bg: 'rgba(184,190,200,0.10)' },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function FeedbackAdminPage() {
  const [tab, setTab] = useState<FeedbackStatus | 'all'>('new')
  const [items, setItems] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const q = tab === 'all' ? '' : `?status=${tab}`
    fetch(`/api/admin/feedback${q}`)
      .then(r => r.json())
      .then((data: FeedbackRow[]) => {
        if (cancelled) return
        setItems(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab])

  const visible = useMemo(
    () => sourceFilter === 'all' ? items : items.filter(i => i.source === sourceFilter),
    [items, sourceFilter],
  )

  const sourcesPresent = useMemo(
    () => Array.from(new Set(items.map(i => i.source))),
    [items],
  )

  async function updateStatus(feedbackId: string, status: FeedbackStatus) {
    await fetch('/api/admin/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId, status }),
    })
    // 現在のタブから外れる場合はリストから除く、そうでなければバッジ更新
    setItems(prev =>
      tab === 'all' || tab === status
        ? prev.map(i => i.feedbackId === feedbackId ? { ...i, status } : i)
        : prev.filter(i => i.feedbackId !== feedbackId),
    )
  }

  async function remove(feedbackId: string) {
    if (!confirm('このフィードバックを削除しますか？（元に戻せません）')) return
    await fetch(`/api/admin/feedback?feedbackId=${feedbackId}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.feedbackId !== feedbackId))
  }

  return (
    <div style={{ maxWidth: '880px' }}>
      <div style={{ marginBottom: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '0.10em' }}>フィードバック</h2>
        <p style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '6px', lineHeight: 1.7 }}>
          匿名で寄せられたご意見です。送信者は特定できません。表示されるのは「どの導線から来たか」と内容のみです。
        </p>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--admin-border)', marginTop: '20px', marginBottom: '16px' }}>
        {STATUS_TABS.map(({ key, label }) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--admin-accent)' : '2px solid transparent',
                color: active ? 'var(--cream)' : 'var(--dim)',
                fontSize: '13px',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Source filter */}
      {sourcesPresent.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em' }}>導線:</span>
          {['all', ...sourcesPresent].map(s => {
            const active = sourceFilter === s
            return (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                style={{
                  padding: '4px 12px',
                  background: active ? 'rgba(184,190,200,0.14)' : 'transparent',
                  border: '1px solid var(--admin-border)',
                  borderRadius: '999px',
                  color: active ? 'var(--cream)' : 'var(--dim)',
                  fontSize: '11px',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >
                {s === 'all' ? 'すべて' : FEEDBACK_SOURCE_LABELS[s as keyof typeof FEEDBACK_SOURCE_LABELS]}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--dim)', padding: '40px 0', textAlign: 'center' }}>読み込み中...</p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--dim)', padding: '40px 0', textAlign: 'center' }}>フィードバックはありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {visible.map(item => {
            const badge = STATUS_BADGE[item.status]
            return (
              <div
                key={item.feedbackId}
                style={{
                  background: 'var(--admin-card-bg)',
                  border: '1px solid var(--admin-border)',
                  borderRadius: '10px',
                  padding: '18px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '999px', background: badge.bg, color: badge.color, letterSpacing: '0.04em' }}>
                    {badge.label}
                  </span>
                  <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '999px', background: 'rgba(240,235,224,0.04)', color: 'var(--dim)', letterSpacing: '0.04em' }}>
                    {FEEDBACK_SOURCE_LABELS[item.source]}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--dim)' }}>
                    {FEEDBACK_CATEGORY_LABELS[item.category]}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--dim)', marginLeft: 'auto' }}>
                    {formatDate(item.createdAt)}
                  </span>
                </div>

                <p style={{ fontSize: '14px', color: 'var(--cream)', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>
                  {item.content}
                </p>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                  {item.status === 'new' && (
                    <ActionButton onClick={() => updateStatus(item.feedbackId, 'read')}>既読にする</ActionButton>
                  )}
                  {item.status !== 'archived' && (
                    <ActionButton onClick={() => updateStatus(item.feedbackId, 'archived')}>対応済にする</ActionButton>
                  )}
                  {item.status === 'archived' && (
                    <ActionButton onClick={() => updateStatus(item.feedbackId, 'read')}>未対応に戻す</ActionButton>
                  )}
                  <ActionButton onClick={() => remove(item.feedbackId)} danger>削除</ActionButton>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ActionButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        background: 'transparent',
        border: `1px solid ${danger ? 'rgba(224,85,85,0.4)' : 'var(--admin-border)'}`,
        borderRadius: '6px',
        color: danger ? '#e07070' : 'var(--dim)',
        fontSize: '12px',
        letterSpacing: '0.04em',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
