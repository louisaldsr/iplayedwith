'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'

/** The back-office's own visits are not the game's audience. */
function dropAdmin(event: BeforeSendEvent): BeforeSendEvent | null {
  return new URL(event.url).pathname.startsWith('/admin') ? null : event
}

/**
 * Vercel Web Analytics: page views, referrers, countries — cookieless, nothing stored in the
 * visitor's browser, so no consent banner (the same line as `src/lib/visitor.ts`: no tracking).
 *
 * Production builds only: dev servers and the e2e suite never load the external script. Collects
 * nothing until Web Analytics is enabled in the Vercel project.
 */
export function SiteAnalytics() {
  if (process.env.NODE_ENV !== 'production') return null
  return <Analytics beforeSend={dropAdmin} />
}
