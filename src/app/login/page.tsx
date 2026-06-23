import AuthForm from '@/components/auth/AuthForm'

export const metadata = { title: 'ログイン — Sikō Coffee' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <AuthForm mode="login" oauthError={error} />
}
