import { redirect } from 'next/navigation'
import { getSessionRoaster } from '@/lib/roasterAuth'
import RoasterLotsClient from './RoasterLotsClient'

export const metadata = { title: '在庫ロット — Sikō Coffee' }
export const dynamic = 'force-dynamic'

// 在庫ロットの管理（§7 / §11.2④）。active な焙煎者のみ。
// beanId は URL クエリで受け、初期選択に使う（useSearchParams の Suspense を避けるためサーバーで解決）。
export default async function RoasterLotsPage({
  searchParams,
}: {
  searchParams: Promise<{ beanId?: string }>
}) {
  const ctx = await getSessionRoaster()
  if (!ctx) redirect('/login')
  const status = ctx.roaster?.status
  if (status !== 'active' && status !== 'selling_out') redirect('/roaster')
  const { beanId } = await searchParams
  return <RoasterLotsClient initialBeanId={beanId ?? null} />
}
