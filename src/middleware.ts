import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, verifySessionToken } from '@/lib/adminSession'
import { isVisitorId } from '@/domain/dailyResult'
import { setVisitorCookie, VISITOR_COOKIE } from '@/lib/visitorCookie'

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/:sport/daily/:path*'],
}

const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) return renewVisitorCookie(req)

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const authenticated = await verifySessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value)
  if (authenticated) return NextResponse.next()

  if (pathname.startsWith('/api/admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.redirect(new URL('/admin/login', req.url))
}

/**
 * Pushes the visitor cookie's expiry back by another 400 days (`src/lib/visitorCookie.ts`). On the daily
 * routes only — dynamic, never cached, and hit by anyone who plays: a player back once a year keeps the id.
 */
function renewVisitorCookie(req: NextRequest): NextResponse {
  const res = NextResponse.next()
  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value
  if (isVisitorId(visitorId)) setVisitorCookie(res, req.nextUrl, visitorId)
  return res
}
