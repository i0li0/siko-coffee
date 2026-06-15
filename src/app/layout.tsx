import type { Metadata } from 'next';
import {
  Cormorant_Garamond,
  IBM_Plex_Mono,
  IBM_Plex_Sans_JP,
  IBM_Plex_Serif,
} from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import { GoogleAnalytics } from '@next/third-parties/google';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const ibmMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-mono',
  display: 'swap',
});

const ibmSansJP = IBM_Plex_Sans_JP({
  subsets: ['latin'],
  weight: ['200', '300', '400'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-ibm-serif',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.sikocoffee.com'),
  icons: {
    icon: [
      { url: '/images/logo/logo_siko8.png', sizes: '512x512', type: 'image/png' },
      { url: '/images/logo/logo_siko8.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/images/logo/logo_siko8.png',
  },
  title: 'Sikō Coffee',
  description: '思考・試行・至高・嗜好 — Think, try, pursue, savor.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://www.sikocoffee.com' },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && {
    verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION },
  }),
  openGraph: {
    title: 'Sikō Coffee',
    description: '暗闇の向こうに、光がある。',
    locale: 'ja_JP',
    images: ['/images/og.jpg'],
    type: 'website',
    url: 'https://www.sikocoffee.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sikō Coffee',
    description: '暗闇の向こうに、光がある。',
    images: ['/images/og.jpg'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CafeOrCoffeeShop',
  name: 'Sikō Coffee',
  description: 'ディカフェ専門コーヒーショップ。思考・試行・至高・嗜好の4つのしこうで構成されるブランド。',
  url: 'https://www.sikocoffee.com',
  telephone: null,
  email: 'siko.is.coffee@gmail.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '潮新町１丁目１２−１７ コパン荘10号室',
    addressLocality: '高知市',
    addressRegion: '高知県',
    postalCode: '781-8008',
    addressCountry: 'JP',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Saturday',
      opens: '17:00',
      closes: '22:00',
    },
  ],
  servesCuisine: 'Coffee',
  menu: 'https://www.sikocoffee.com/#menu',
  hasMap: 'https://www.google.com/maps/search/?api=1&query=高知市潮新町１丁目１２−１７+コパン荘',
  priceRange: '¥500〜¥1,000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ja"
      className={`${cormorant.variable} ${ibmMono.variable} ${ibmSansJP.variable} ${ibmSerif.variable}`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
      {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      )}
    </html>
  );
}
