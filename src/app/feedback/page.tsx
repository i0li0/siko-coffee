import type { Metadata } from 'next'
import FeedbackForm from './FeedbackForm'

export const metadata: Metadata = {
  title: 'ご意見・ご感想 | Sikō Coffee',
  description: '匿名でご意見・ご感想をお寄せいただけます。お名前やメールアドレスは収集しません。',
  robots: { index: false, follow: false },
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  return <FeedbackForm from={from ?? ''} />
}
