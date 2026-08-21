import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, constantTimeEqual, createSessionToken } from '@/lib/adminSession'

/** POST /api/admin/login — body { password }. Sets a signed session cookie on success. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword || !password || !constantTimeEqual(password, adminPassword)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  })
  return res
}
