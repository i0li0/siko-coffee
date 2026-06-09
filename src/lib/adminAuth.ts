import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifySessionToken } from './adminSession'

export async function verifyAdminSession(): Promise<NextResponse | null> {
  const store = await cookies()
  const token = store.get('admin_session')?.value ?? ''
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Alias for existing API routes
export const verifyAdminToken = verifyAdminSession
