import AdminSidebar from '@/components/admin/AdminSidebar'

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <AdminSidebar />
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px',
        color: 'var(--cream)',
        fontFamily: 'var(--font-sans)',
      }}>
        {children}
      </main>
    </div>
  )
}
