import { redirect } from 'next/navigation'
import { getSessionRoaster } from '@/lib/roasterAuth'
import RoasterOrdersClient from './RoasterOrdersClient'

export const metadata = { title: '発注応答 — Sikō Coffee' }
export const dynamic = 'force-dynamic'

// 発注応答画面（§6.2）。active な焙煎者のみ。非 active はハブへ戻す。
export default async function RoasterOrdersPage() {
  const ctx = await getSessionRoaster()
  if (!ctx) redirect('/login')
  const status = ctx.roaster?.status
  if (status !== 'active' && status !== 'selling_out') redirect('/roaster')
  return <RoasterOrdersClient />
}
