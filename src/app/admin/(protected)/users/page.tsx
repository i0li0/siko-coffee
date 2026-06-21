'use client'

import { useEffect, useState } from 'react'

interface UserItem {
  id: string
  email: string
  name: string | null
  createdAt: string | null
  emailVerified: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users ?? [])
        setTotal(data.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const thisMonth = users.filter((u) => {
    if (!u.createdAt) return false
    const d = new Date(u.createdAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length

  const today = users.filter((u) => {
    if (!u.createdAt) return false
    const d = new Date(u.createdAt)
    return d.toDateString() === now.toDateString()
  }).length

  return (
    <div>
      <h1 style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '0.08em', margin: '0 0 24px' }}>
        ユーザー管理
      </h1>

      {/* Stats cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
        {[
          { label: '総ユーザー数', value: total },
          { label: '今月の登録', value: thisMonth },
          { label: '本日の登録', value: today },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: '8px',
              padding: '20px 24px',
              minWidth: '160px',
              flex: '1 1 160px',
            }}
          >
            <p style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              {label}
            </p>
            <p style={{ fontSize: '28px', fontWeight: 300, margin: 0, color: 'var(--cream)' }}>
              {loading ? '—' : value}
            </p>
          </div>
        ))}
      </div>

      {/* User table */}
      <div
        style={{
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          overflow: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
            color: 'var(--cream)',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
              {['メール', '名前', '登録日', 'メール認証'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: '11px',
                    color: 'var(--dim)',
                    letterSpacing: '0.08em',
                    fontWeight: 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--dim)' }}>
                  読み込み中…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--dim)' }}>
                  登録ユーザーはいません
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                  <td style={{ padding: '10px 16px' }}>{u.email}</td>
                  <td style={{ padding: '10px 16px', color: u.name ? 'var(--cream)' : 'var(--dim)' }}>
                    {u.name || '—'}
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    {formatDateTime(u.createdAt)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {u.emailVerified ? (
                      <span style={{ color: 'var(--admin-success)', fontSize: '11px' }}>
                        認証済 ({formatDate(u.emailVerified)})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--dim)', fontSize: '11px' }}>未認証</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
