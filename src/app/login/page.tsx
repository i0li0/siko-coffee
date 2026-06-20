import AuthForm from '@/components/auth/AuthForm'

export const metadata = { title: 'ログイン — Sikō Coffee' }

export default function LoginPage() {
  return <AuthForm mode="login" />
}
