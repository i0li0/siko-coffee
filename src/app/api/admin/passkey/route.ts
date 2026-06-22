import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/adminAuth'
import { notifySlack } from '@/lib/slackNotify'
import { getCredentials, removeCredential } from '@/lib/adminPasskey'

// GET: 登録済みパスキー一覧（公開鍵などの機密値は返さない）
export async function GET() {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const creds = await getCredentials()
  return NextResponse.json({
    passkeys: creds.map(c => ({
      id: c.id,
      label: c.label,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt ?? null,
    })),
  })
}

// DELETE: 指定パスキーを削除
export async function DELETE(request: NextRequest) {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const creds = await getCredentials()
  const removed = creds.find(c => c.id === id)
  await removeCredential(id)

  if (removed) {
    await notifySlack(`🔑 管理画面パスキーが削除されました: 「${removed.label}」（身に覚えがなければ全パスキーの確認とパスワード/TOTP のローテーションを推奨）`)
  }

  return NextResponse.json({ ok: true })
}
