import { redirect } from 'next/navigation'
import { getSessionRoaster } from '@/lib/roasterAuth'
import RoasterHubClient from './RoasterHubClient'

export const metadata = { title: '焙煎者ダッシュボード — Sikō Coffee' }
export const dynamic = 'force-dynamic'

// 焙煎者ハブ（§13.1 UI 出し分け）。ログイン必須・状態は都度 Get で最新。
export default async function RoasterPage() {
  const ctx = await getSessionRoaster()
  if (!ctx) redirect('/login')
  return <RoasterHubClient roaster={ctx.roaster} />
}
