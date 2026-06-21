import type { MetadataRoute } from 'next'
import { BEANS } from '@/components/shop/blend/data'

const BASE = 'https://www.sikocoffee.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: '2026-06-21',
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${BASE}/shop`,
      lastModified: '2026-06-21',
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE}/legal/tokushoho`,
      lastModified: '2026-06-07',
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE}/legal/privacy`,
      lastModified: '2026-06-07',
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...BEANS.map((b) => ({
      url: `${BASE}/shop/product/${b.key}`,
      lastModified: '2026-06-21',
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
