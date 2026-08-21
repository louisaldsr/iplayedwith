import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, verifySessionToken } from '@/lib/adminSession'

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}

const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const authenticated = await verifySessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value)
  if (authenticated) return NextResponse.next()

  if (pathname.startsWith('/api/admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.redirect(new URL('/admin/login', req.url))
}
