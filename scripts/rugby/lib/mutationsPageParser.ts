import * as cheerio from 'cheerio'
import { PROFILE_URL_RE } from './playersListParser'

/**
 * Extracts every unique player-profile link from an allrugby.com page — a nationality
 * list (e.g. /joueurs/france.html) or a mutations/transfer-window page (e.g.
 * /dossiers/mutations-top14.html) alike, since both just link to
 * `/joueurs/{slug}-{id}.html` throughout. Name/nationality/career data for each player
 * still comes from their own profile page, fetched separately; this only discovers
 * which profiles to visit.
 */
export function extractPlayerProfileUrls(html: string): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()

  $('a[href*="/joueurs/"]').each((_, a) => {
    const href = $(a).attr('href') || ''
    if (PROFILE_URL_RE.test(href)) urls.add(href)
  })

  return [...urls]
}
