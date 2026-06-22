import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/adminSession'

function needsAdminSession(pathname: string): boolean {
  if (pathname === '/admin/login') return false
  if (pathname.startsWith('/api/admin/auth')) return false
  // パスキーログインは未ログインで叩く必要がある（認証成功時にセッションを発行する）。
  if (pathname.startsWith('/api/admin/passkey/login')) return false
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/admin')) {
    const origin = request.headers.get('origin')
    const allowed = new URL(request.url).origin
    // 状態変更系メソッドは origin 必須・一致を強制（CSRF 対策）。
    // モダンブラウザは同一オリジンの fetch でも unsafe メソッドに Origin を付与するため、
    // origin 欠落＝非ブラウザ/詐称とみなして拒否する。
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    if (isMutation) {
      if (!origin || origin !== allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (origin && origin !== allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

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
