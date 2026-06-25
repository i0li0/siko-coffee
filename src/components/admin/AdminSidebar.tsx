'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV_GROUPS = [
  {
    label: '概要',
    items: [
      { href: '/admin/dashboard',    label: 'ダッシュボード', icon: IconDashboard },
      { href: '/admin/daily-report', label: '営業日レポート', icon: IconCalendar },
      { href: '/admin/monthly',      label: '月次レポート',   icon: IconChart },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/admin/orders',    label: '注文管理',   icon: IconOrders },
      { href: '/admin/products',  label: '商品管理',   icon: IconProducts },
      { href: '/admin/blends',    label: 'ブレンド管理', icon: IconBlend },
      { href: '/admin/inventory', label: '在庫管理',   icon: IconInventory },
      { href: '/admin/users',     label: 'ユーザー管理', icon: IconUsers },
      { href: '/admin/feedback',  label: 'フィードバック', icon: IconFeedback },
    ],
  },
  {
    label: '会計',
    items: [
      { href: '/admin/expenses', label: '経費管理', icon: IconExpenses },
      { href: '/admin/tax',      label: '確定申告', icon: IconTax },
    ],
  },
  {
    label: 'システム',
    items: [
      { href: '/admin/links',    label: '外部ツール', icon: IconLink },
      { href: '/admin/settings', label: '設定',     icon: IconSettings },
    ],
  },
] as const

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function IconOrders() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  )
}

function IconProducts() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function IconBlend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 010 8h-1" />
      <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  )
}

function IconInventory() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function IconExpenses() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  )
}

function IconTax() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function IconFeedback() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function AdminSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={onToggle}
        aria-label="メニューを開く"
        className="admin-mobile-menu-btn"
        style={{
          position: 'fixed',
          top: '14px',
          left: '14px',
          zIndex: 60,
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          color: 'var(--cream)',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {open ? <IconClose /> : <IconMenu />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          onClick={onToggle}
          className="admin-sidebar-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 49,
            display: 'none',
          }}
        />
      )}

      <aside
        className={`admin-sidebar ${open ? 'admin-sidebar--open' : ''}`}
        style={{
          width: '230px',
          minWidth: '230px',
          background: 'var(--admin-sidebar-bg)',
          borderRight: '1px solid var(--admin-border)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 50,
        }}
      >
        {/* Brand */}
        <div style={{ padding: '28px 22px 20px' }}>
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
            letterSpacing: '0.18em',
            marginTop: '4px',
            textTransform: 'uppercase',
          }}>
            Admin
          </p>
        </div>

        {/* Navigation groups */}
        <nav style={{ flex: 1, padding: '0 0 8px', overflowY: 'auto' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: '4px' }}>
              <p style={{
                fontSize: '9px',
                color: 'var(--dim)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                padding: '16px 22px 6px',
                margin: 0,
              }}>
                {group.label}
              </p>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => { if (open) onToggle() }}
                    className="admin-nav-link"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 22px',
                      fontSize: '13px',
                      color: active ? 'var(--cream)' : 'var(--dim)',
                      background: active ? 'rgba(240,235,224,0.06)' : 'transparent',
                      borderLeft: active ? '2px solid var(--admin-accent)' : '2px solid transparent',
                      textDecoration: 'none',
                      letterSpacing: '0.04em',
                      transition: 'color 0.15s, background 0.15s, border-color 0.15s',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ opacity: active ? 1 : 0.5, transition: 'opacity 0.15s', display: 'flex', alignItems: 'center' }}>
                      <Icon />
                    </span>
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '16px 22px 24px' }}>
          <button
            onClick={handleLogout}
            className="admin-nav-link"
            style={{
              width: '100%',
              padding: '9px 12px',
              background: 'transparent',
              border: '1px solid var(--admin-border)',
              borderRadius: '6px',
              color: 'var(--dim)',
              fontSize: '12px',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            <IconLogout />
            ログアウト
          </button>
        </div>
      </aside>
    </>
  )
}
