import { normalize } from '../../common/textNormalize'

/**
 * Where a constructor's logo comes from: its English Wikipedia article (Jolpica links it).
 *
 * The infobox's `logo` field first — the article's own answer, and the only place the teams'
 * trademarked logos live (Ferrari, Red Bull, Mercedes are not on Commons). Not the article's lead
 * image: that is a car photo as often as a logo (Maserati, Rebaque).
 *
 * Wikidata's "logo image" (P154) next, but only a drawn file — SVG or PNG: some items point at a
 * photograph instead (Alta's is its engine).
 */

/**
 * Infobox "logos" that are photographs — a car on track, a badge on a bonnet, a chassis plate —
 * whose background no cleaning removes. Reviewed by eye on the contact sheet of every logo; such a
 * constructor shows the empty slot instead. Keyed by file, so an article that gets a real logo
 * later is picked up again.
 */
const PHOTOGRAPHS = new Set([
  'AFM badge.jpg',
  'Connaught badge.jpg',
  'Connew PC1 chassis plate.jpg',
  'Emeryson car badge.jpg',
  'EurobrunER189 RaceHistoryOnTrack HH2011.jpg',
  'HWM badge, Shelsey Walsh 2025.jpg',
  'Hector Rebaque Lotus 78.jpg',
  'Hesketh "teddy bear" logo used in 1974 and 1975.jpg',
  'British Racing Partnership team logo.jpg',
  'Kurtis Kraft car badge.jpg',
  'OSCA badge - Flickr - exfordy.jpg',
  'Scirocco logo, Goodwood Revival 2014.jpg',
  'Spirit 101 at Silverstone Classic 2011 (1).jpg',
  'Tec-Mec badge.jpg',
  'Toleman badge, Race Retro Stoneleigh 2018.jpg',
])

/** False for a file reviewed as a photograph rather than a logo. */
export const isLogo = (file: string): boolean => !PHOTOGRAPHS.has(file)

/**
 * Logos that pair the team's mark with a title sponsor's, keeping the team's alone — the first
 * mark from the left (`firstMark`). Players look for Ferrari, not HP. Keyed by file, as above.
 */
const TEAM_MARK_FIRST = new Set(['Scuderia Ferrari HP logo 24.svg'])

/** True for a file whose first mark alone is the team's logo. */
export const keepsFirstMarkOnly = (file: string): boolean => TEAM_MARK_FIRST.has(file)

/** The file named by the first `| logo = …` line of an infobox, without "File:"; null if none. */
export function logoFileOf(wikitext: string): string | null {
  const line = wikitext.match(/^\s*\|\s*logo\s*=\s*(.+)$/im)
  if (!line) return null
  const value = line[1].trim()
  const link = value.match(/\[\[\s*(?:File|Image)\s*:\s*([^|\]]+)/i)
  const name = (link ? link[1] : value.split('|')[0]).trim().replace(/^(?:File|Image)\s*:\s*/i, '')
  return /\.(svg|png|jpe?g|gif|webp)$/i.test(name) ? name : null
}

/** A drawn logo, not a photograph — the only kind taken from Wikidata. */
export const isDrawnLogo = (file: string): boolean => /\.(svg|png)$/i.test(file)

/** The cleaned file's name: one per article, shared by its constructors — "Team Lotus" → `team-lotus.png`. */
export function logoFileName(articleTitle: string): string {
  const slug = normalize(articleTitle)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) throw new Error(`No file name for "${articleTitle}"`)
  return `${slug}.png`
}

/** Where the cleaned logo is served from — `public/logos/formula1/`, a path the app loads as-is. */
export const publicLogoUrl = (fileName: string) => `/logos/formula1/${fileName}`
