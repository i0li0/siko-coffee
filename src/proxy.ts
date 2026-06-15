import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/adminSession'

// 管理エリアのうち認証が必要なパス。ログイン関連は除外する。
function needsAdminSession(pathname: string): boolean {
  if (pathname === '/admin/login') return false
  if (pathname.startsWith('/api/admin/auth')) return false
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 管理ページ・管理APIのセッションゲート（多層防御）。
  // 各 API ルートも個別に verifyAdminToken するが、ここで前段ブロックする。
  if (needsAdminSession(pathname)) {
    const token = request.cookies.get('admin_session')?.value ?? ''
    if (!token || !(await verifySessionToken(token))) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
