import * as cheerio from 'cheerio'

export const PROFILE_URL_RE = /\/player\/([a-z0-9-]+)\/?$/

/**
 * Extracts every unique player-profile link from an all.rugby transfers page
 * (e.g. /transfers/premiership) — discovery only, same role
 * mutationsPageParser.extractPlayerProfileUrls has for allrugby.com. Name/nationality/
 * career data for each player still comes from their own profile page.
 */
export function extractPlayerProfileUrls(html: string): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()

  $('a[href*="/player/"]').each((_, a) => {
    const href = $(a).attr('href') || ''
    if (PROFILE_URL_RE.test(href)) urls.add(href)
  })

  return [...urls]
}
