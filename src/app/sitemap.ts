import type { MetadataRoute } from 'next'
import { SPORTS } from '@/domain/sport'
import { SITE_URL } from '@/lib/siteUrl'

/** Served as /sitemap.xml — every public page. A sport's page holds a new daily challenge every day. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    ...SPORTS.flatMap((sport) => [
      { url: `${SITE_URL}/${sport}`, changeFrequency: 'daily' as const, priority: 0.9 },
      { url: `${SITE_URL}/${sport}/free`, changeFrequency: 'monthly' as const, priority: 0.6 },
    ]),
    { url: `${SITE_URL}/about`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
