import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE } from '@/lib/adminSession'

/** POST /api/admin/logout — clears the session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
