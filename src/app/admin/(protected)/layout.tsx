'use client'

import { useState } from 'react'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .admin-mobile-menu-btn { display: flex !important; }
          .admin-sidebar-overlay { display: block !important; }
          .admin-sidebar {
            position: fixed !important;
            top: 0;
            left: 0;
            bottom: 0;
            transform: translateX(-100%);
          }
          .admin-sidebar--open {
            transform: translateX(0) !important;
          }
          .admin-main {
            padding: 24px 16px !important;
            padding-top: 64px !important;
          }
        }
        .admin-nav-link:hover {
          color: var(--cream) !important;
          background: rgba(240,235,224,0.04);
        }
        @media (prefers-reduced-motion: reduce) {
          .admin-sidebar,
          .admin-nav-link {
            transition: none !important;
          }
        }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <AdminSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(v => !v)} />
        <main
          className="admin-main"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px 40px',
            color: 'var(--cream)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {children}
        </main>
      </div>
    </>
  )
}
