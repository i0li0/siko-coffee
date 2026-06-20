import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/adminSession'

function needsAdminSession(pathname: string): boolean {
  if (pathname === '/admin/login') return false
  if (pathname.startsWith('/api/admin/auth')) return false
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/admin')) {
    const origin = request.headers.get('origin')
    if (origin) {
      const allowed = new URL(request.url).origin
      if (origin !== allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
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
