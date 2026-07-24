import { redirect } from 'next/navigation'
import { getSessionRoaster } from '@/lib/roasterAuth'
import RoasterApplyClient from './RoasterApplyClient'

export const metadata = { title: '焙煎者登録 — Sikō Coffee' }
export const dynamic = 'force-dynamic'

// 焙煎者昇格の申請フォーム（§6.1.1 / §13.2）。ログイン必須。
// 既に申請済み・承認済みなら二重申請させずハブへ戻す（apply API も 409 で弾く）。
export default async function RoasterApplyPage() {
  const ctx = await getSessionRoaster()
  if (!ctx) redirect('/login')
  if (ctx.roaster) redirect('/roaster')
  return <RoasterApplyClient />
}
