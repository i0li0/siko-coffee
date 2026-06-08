import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

function safeTokenCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export async function verifyAdminToken(): Promise<NextResponse | null> {
  const store = await cookies()
  const token = store.get('admin_token')?.value ?? ''
  const expected = process.env.ADMIN_TOKEN_HASH ?? ''

  if (!expected || !safeTokenCompare(token, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
