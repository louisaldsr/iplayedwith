import type { NextResponse } from 'next/server'
import { isVisitorId } from '@/domain/dailyResult'
import { SITE_URL } from '@/lib/siteUrl'

/**
 * A second copy of the visitor's anonymous id (`src/lib/visitor.ts`), in a cookie — the copy that
 * survives Safari.
 *
 * Safari (and every iOS browser, all WebKit) deletes a site's `localStorage` after 7 days of
 * browsing without visiting it: the id, and with it the username and every result the server
 * keeps under it, would be lost to a player who skipped a week. Cookies are not in that purge, as
 * long as the **server** sets them — a cookie written by `document.cookie` is itself capped at
 * 7 days. So the server sets it (`POST /api/visitor`) and pushes its expiry back (middleware,
 * daily routes); the browser only reads it, when `localStorage` comes back empty.
 *
 * Not HttpOnly, on purpose: `readVisitor` stays synchronous, with no request to learn the id. The
 * trust model does not move — whoever can read or forge it could already do so in `localStorage`.
 *
 * Strictly necessary and first-party (it keeps the player's own results), no tracking: no consent
 * banner.
 */

export const VISITOR_COOKIE = 'ipw_vid'

/** 400 days — the longest a browser keeps a cookie, whatever is asked. */
export const VISITOR_COOKIE_MAX_AGE = 400 * 24 * 60 * 60

/**
 * The cookie's attributes on a response to `url`. On the site's own domain it is shared by
 * `iplayedwith.com` and `www.` (one visitor whichever is typed); anywhere else — dev, a
 * `*.vercel.app` preview — it stays host-only, since a browser refuses a cookie for another domain.
 */
export function visitorCookieOptions(url: URL) {
  const site = new URL(SITE_URL).hostname
  const onSite = url.hostname === site || url.hostname.endsWith(`.${site}`)
  return {
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE,
    sameSite: 'lax' as const,
    secure: url.protocol === 'https:',
    ...(onSite ? { domain: site } : {}),
  }
}

/** Sets (or renews) the cookie on a response. */
export function setVisitorCookie(res: NextResponse, url: URL, visitorId: string): void {
  res.cookies.set(VISITOR_COOKIE, visitorId, visitorCookieOptions(url))
}

/** The id the cookie holds, from a `document.cookie`-style string — null when absent or not a UUID. */
export function visitorIdFromCookies(cookies: string): string | null {
  for (const pair of cookies.split(';')) {
    const [name, ...value] = pair.trim().split('=')
    if (name !== VISITOR_COOKIE) continue
    const id = decodeURIComponent(value.join('='))
    return isVisitorId(id) ? id : null
  }
  return null
}
