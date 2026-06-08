import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function verifyAdminToken(): Promise<NextResponse | null> {
  const store = await cookies()
  const token = store.get('admin_token')?.value

  if (token !== process.env.ADMIN_TOKEN_HASH) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
