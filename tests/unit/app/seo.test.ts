import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { generateMetadata as sportMetadata } from '@/app/[sport]/page'
import { generateMetadata as freeMetadata } from '@/app/[sport]/free/page'
import { SITE_URL } from '@/lib/siteUrl'

const params = (sport: string) => ({ params: Promise.resolve({ sport }) })

describe('robots.txt', () => {
  it('opens the game to crawlers, keeps the back-office and the API out, and points to the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
      sitemap: 'https://iplayedwith.com/sitemap.xml',
      host: SITE_URL,
    })
  })
})

describe('sitemap.xml', () => {
  it('lists every public page on the real domain — each sport, daily and free', () => {
    expect(sitemap().map((e) => e.url)).toEqual([
      'https://iplayedwith.com',
      'https://iplayedwith.com/rugby',
      'https://iplayedwith.com/rugby/free',
      'https://iplayedwith.com/football',
      'https://iplayedwith.com/football/free',
      'https://iplayedwith.com/basketball',
      'https://iplayedwith.com/basketball/free',
      'https://iplayedwith.com/formula1',
      'https://iplayedwith.com/formula1/free',
      'https://iplayedwith.com/about',
    ])
  })
})

describe('page metadata', () => {
  it("names each sport's daily challenge, with its own canonical URL", async () => {
    await expect(sportMetadata(params('rugby'))).resolves.toMatchObject({
      title: 'Rugby daily challenge',
      alternates: { canonical: '/rugby' },
    })
  })

  it('names free play per sport', async () => {
    await expect(freeMetadata(params('football'))).resolves.toMatchObject({
      title: 'Free play — Football',
      alternates: { canonical: '/football/free' },
    })
  })

  it('gives an unknown sport nothing (the page 404s)', async () => {
    await expect(sportMetadata(params('curling'))).resolves.toEqual({})
  })
})
