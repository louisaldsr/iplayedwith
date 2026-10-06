import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/siteUrl'

/** Served as /robots.txt: the game is open to crawlers; the back-office and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
