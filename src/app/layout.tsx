import type { Metadata } from 'next'
import { Cormorant_Garamond, Noto_Sans_JP } from 'next/font/google'
import './globals.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const noto = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['200', '300'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sikō Coffee',
  description: '思考・試行・至高・嗜好 — Think, try, pursue, savor.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Sikō Coffee',
    description: '暗闇の向こうに、光がある。',
    locale: 'ja_JP',
    images: ['/images/og.jpg'],
    type: 'website',
    url: 'https://sikocoffee.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${cormorant.variable} ${noto.variable}`}>
      <body>{children}</body>
    </html>
  )
}
