/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import {
  setVisitorCookie,
  VISITOR_COOKIE_MAX_AGE,
  visitorCookieOptions,
  visitorIdFromCookies,
} from '@/lib/visitorCookie'
import { middleware } from '@/middleware'

const ID = '3f2b8c1e-9a4d-4e7f-8b2c-1d5e6f7a8b9c'

describe('visitorCookieOptions', () => {
  it('on the site, is shared by the bare domain and www, secure, for 400 days', () => {
    for (const host of ['https://iplayedwith.com/api/visitor', 'https://www.iplayedwith.com/api/visitor']) {
      expect(visitorCookieOptions(new URL(host))).toEqual({
        path: '/',
        maxAge: VISITOR_COOKIE_MAX_AGE,
        sameSite: 'lax',
        secure: true,
        domain: 'iplayedwith.com',
      })
    }
  })

  it('anywhere else stays host-only — a browser refuses a cookie for another domain', () => {
    expect(visitorCookieOptions(new URL('https://iplayedwith-git-x.vercel.app/'))).not.toHaveProperty('domain')
    expect(visitorCookieOptions(new URL('https://notiplayedwith.com/'))).not.toHaveProperty('domain')
  })

  it('is not marked secure over plain HTTP (the dev server)', () => {
    expect(visitorCookieOptions(new URL('http://localhost:3000/')).secure).toBe(false)
  })
})

describe('visitorIdFromCookies', () => {
  it('finds the id among other cookies', () => {
    expect(visitorIdFromCookies(`a=1; ipw_vid=${ID}; b=2`)).toBe(ID)
  })

  it('is null when the cookie is absent, or holds anything but a UUID', () => {
    expect(visitorIdFromCookies('')).toBeNull()
    expect(visitorIdFromCookies('xipw_vid=' + ID)).toBeNull()
    expect(visitorIdFromCookies('ipw_vid=me')).toBeNull()
  })
})

describe('setVisitorCookie', () => {
  it('writes a cookie script can read — not HttpOnly — that lasts', async () => {
    const { NextResponse } = await import('next/server')
    const res = NextResponse.json({})
    setVisitorCookie(res, new URL('https://iplayedwith.com/api/visitor'), ID)

    const header = res.headers.get('set-cookie') ?? ''
    expect(header).toContain(`ipw_vid=${ID}`)
    expect(header).toMatch(/Domain=iplayedwith\.com/i)
    expect(header).toMatch(/Max-Age=34560000/i)
    expect(header).not.toMatch(/HttpOnly/i)
  })
})

describe('middleware, on the daily routes', () => {
  const daily = (cookie?: string) =>
    new NextRequest('https://iplayedwith.com/api/rugby/daily/start', {
      method: 'POST',
      headers: cookie ? { cookie } : {},
    })

  it('pushes the visitor cookie back by another 400 days', async () => {
    const res = await middleware(daily(`ipw_vid=${ID}`))
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`ipw_vid=${ID}.*Max-Age=34560000`, 'i'))
  })

  it('sets nothing without a valid cookie — only POST /api/visitor creates it', async () => {
    expect((await middleware(daily())).headers.get('set-cookie')).toBeNull()
    expect((await middleware(daily('ipw_vid=forged'))).headers.get('set-cookie')).toBeNull()
  })

  it('still guards the back-office', async () => {
    const res = await middleware(new NextRequest('https://iplayedwith.com/api/admin/anything'))
    expect(res.status).toBe(401)
  })
})
