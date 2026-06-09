'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin/dashboard',     label: 'ダッシュボード' },
  { href: '/admin/daily-report',  label: '営業日レポート' },
  { href: '/admin/expenses',      label: '経費管理' },
  { href: '/admin/tax',           label: '確定申告' },
  { href: '/admin/inventory',     label: '在庫管理' },
  { href: '/admin/orders',        label: 'EC注文' },
  { href: '/admin/monthly',       label: '月次レポート' },
  { href: '/admin/settings',      label: '設定' },
] as const

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  return (
    <aside style={{
      width: '200px',
      minWidth: '200px',
      background: 'var(--admin-sidebar-bg)',
      borderRight: '1px solid var(--admin-border)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ padding: '28px 20px 24px' }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '17px',
          fontWeight: 300,
          color: 'var(--cream)',
          letterSpacing: '0.10em',
        }}>
          Sikō Coffee
        </span>
        <p style={{
          fontSize: '10px',
          color: 'var(--dim)',
          letterSpacing: '0.14em',
          marginTop: '4px',
        }}>
          ADMIN
        </p>
      </div>

      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'block',
                padding: '10px 20px',
                fontSize: '13px',
                color: active ? 'var(--cream)' : 'var(--dim)',
                background: active ? 'rgba(240,235,224,0.06)' : 'transparent',
                borderLeft: active ? '2px solid var(--admin-accent)' : '2px solid transparent',
                textDecoration: 'none',
                letterSpacing: '0.05em',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '20px' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '8px',
            background: 'transparent',
            border: '1px solid var(--admin-border)',
            borderRadius: '5px',
            color: 'var(--dim)',
            fontSize: '12px',
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          ログアウト
        </button>
      </div>
    </aside>
  )
}
