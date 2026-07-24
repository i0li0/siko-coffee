import { redirect } from 'next/navigation'
import { getSessionRoaster } from '@/lib/roasterAuth'
import RoasterBeansClient from './RoasterBeansClient'

export const metadata = { title: '豆の管理 — Sikō Coffee' }
export const dynamic = 'force-dynamic'

// 掲載豆の管理（§6.2.1）。active な焙煎者のみ。非 active はハブへ戻す。
export default async function RoasterBeansPage() {
  const ctx = await getSessionRoaster()
  if (!ctx) redirect('/login')
  const status = ctx.roaster?.status
  if (status !== 'active' && status !== 'selling_out') redirect('/roaster')
  return <RoasterBeansClient />
}
