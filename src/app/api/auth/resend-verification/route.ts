import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/verification-email'

export async function POST() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const sent = await sendVerificationEmail(session.user.email)
  if (!sent) {
    return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
