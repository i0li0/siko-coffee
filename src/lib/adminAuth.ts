import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifySessionStrict } from './adminSession'

export async function verifyAdminSession(): Promise<NextResponse | null> {
  const store = await cookies()
  const token = store.get('admin_session')?.value ?? ''
  if (!token || !(await verifySessionStrict(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Alias for existing API routes
export const verifyAdminToken = verifyAdminSession
