import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AccountClient from './AccountClient'

export const metadata = { title: 'マイページ — Sikō Coffee' }

export default async function AccountPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as typeof session.user & { emailVerified?: string | null }
  return <AccountClient user={user} emailVerified={!!user.emailVerified} />
}
