import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sikō Coffee',
  description: '思考・試行・至高・嗜好 — Think, try, pursue, savor.',
  openGraph: {
    title: 'Sikō Coffee',
    description: '暗闇の向こうに、光がある。',
    locale: 'ja_JP',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Noto+Sans+JP:wght@200;300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
