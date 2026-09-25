import * as cheerio from 'cheerio'
import { extractPlayerProfileUrls as extractAllrugbyComProfileUrls } from './mutationsPageParser'
import { PROFILE_URL_RE as ALLRUGBY_COM_PROFILE_URL_RE } from './playersListParser'
import {
  extractPlayerProfileUrls as extractAllRugbyProfileUrls,
  PROFILE_URL_RE as ALL_RUGBY_PROFILE_URL_RE,
} from './allRugbyTransfersPageParser'
import {
  parsePlayerIdentity,
  parseCareerRows,
  parseCareerStats,
  hasNoProfessionalCareer,
  type PlayerIdentity,
  type CareerRow,
  type CareerStats,
} from './playerProfileParser'
import { alpha2ForFrenchCountryName, alpha2ForEnglishCountryName } from '../../common/nationalities'

export type SourceId = 'allrugby.com' | 'all.rugby'

export type SourceAdapter = {
  origin: string
  extractPlayerProfileUrls(html: string): string[]
  /** Resolves a discovered `<a href>` into an absolute profile URL and a stable per-source player id. */
  resolveProfileLink(href: string): { url: string; id: string } | null
  parseIdentity(html: string): PlayerIdentity | null
  parseCareerRows(html: string): CareerRow[]
  /** Matches played and international caps, for the fame metric. */
  parseCareerStats(html: string): CareerStats
  hasNoCareerRows(html: string): boolean
  nationalityToAlpha2(raw: string): string | null
  /**
   * For a source whose players may also have a page on allrugby.com under its stable
   * numeric id, returns that canonical id/url so the entry can be folded into
   * allrugby.com's single numeric-id space instead of using this source's own id — no
   * fuzzy matching needed for a player we can identify exactly. Returns null when no
   * crosswalk is found (the player has no allrugby.com page) or the source has none.
   */
  crosswalkToAllrugbyCom?(html: string): { url: string; id: string } | null
}

function resolveWith(re: RegExp, origin: string, idGroup: number) {
  return (href: string): { url: string; id: string } | null => {
    const pathname = href.replace(/^https?:\/\/[^/]+/, '')
    const match = pathname.match(re)
    if (!match) return null
    return { url: `${origin}${pathname}`, id: match[idGroup] }
  }
}

const resolveAllrugbyComLink = resolveWith(ALLRUGBY_COM_PROFILE_URL_RE, 'https://www.allrugby.com', 2)

/**
 * all.rugby profile pages carry `<link rel="alternate" hreflang="fr" href="https://www.
 * allrugby.com/joueurs/{slug}-{id}.html">` when the same player also has an allrugby.com
 * page (confirmed on a live page, e.g. damian-penaud) — the two sites share a player
 * database, this is just the language-alternate link. Extracts that id/url.
 */
function crosswalkToAllrugbyCom(html: string): { url: string; id: string } | null {
  const $ = cheerio.load(html)
  const href = $('link[rel="alternate"][hreflang="fr"]').attr('href')
  if (!href) return null
  return resolveAllrugbyComLink(href)
}

export const SOURCES: Record<SourceId, SourceAdapter> = {
  'allrugby.com': {
    origin: 'https://www.allrugby.com',
    extractPlayerProfileUrls: extractAllrugbyComProfileUrls,
    resolveProfileLink: resolveAllrugbyComLink,
    parseIdentity: parsePlayerIdentity,
    parseCareerRows,
    parseCareerStats,
    hasNoCareerRows: hasNoProfessionalCareer,
    nationalityToAlpha2: alpha2ForFrenchCountryName,
  },
  'all.rugby': {
    origin: 'https://all.rugby',
    extractPlayerProfileUrls: extractAllRugbyProfileUrls,
    resolveProfileLink: resolveWith(ALL_RUGBY_PROFILE_URL_RE, 'https://all.rugby', 1),
    // all.rugby runs on the same site template as allrugby.com — identical JSON-LD
    // Person/@graph shape and identical #saison_ov/table.JOverall career-table markup
    // (confirmed against a live saved page) — only the nationality string's language
    // differs, so identity/career parsing is reused as-is.
    parseIdentity: parsePlayerIdentity,
    parseCareerRows,
    parseCareerStats,
    hasNoCareerRows: hasNoProfessionalCareer,
    nationalityToAlpha2: alpha2ForEnglishCountryName,
    crosswalkToAllrugbyCom,
  },
}

export function isSourceId(value: string): value is SourceId {
  return value === 'allrugby.com' || value === 'all.rugby'
}
