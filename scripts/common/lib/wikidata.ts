/**
 * Matching our players to Wikidata items, and the view window — the pure half of `fame:exposure`
 * (the network half is ./wikimedia.ts). The exposure term of the fame score reads the views of
 * the Wikipedia articles of the item matched here (supabase/migrations/025_fame_v3.sql).
 */

/** Lower case, no accents, letters and digits only — the rule of `search_normalize` (008). */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * An external ID compared without accents or case: Wikidata stores Rougerie's All.Rugby ID as
 * "aurélien-rougerie", the site's link as "aurelien-rougerie". A trailing hyphen is kept — it is
 * how all.rugby tells homonyms apart ("tom-wood" and "tom-wood-").
 */
export function normalizeExternalId(id: string): string {
  const base = id.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return base.replace(/[^a-z0-9-]/g, '')
}

export type MatchCandidate = {
  playerId: string
  /** The ID the source shares with Wikidata (All.Rugby ID, Transfermarkt ID); null if unknown. */
  externalId: string | null
  name: string
  /** Career games — the name fallback only applies past `minGamesForName`. */
  games: number
}

export type Match = { qid: string; how: 'id' | 'unique-name' }

/**
 * Matches each player to a Wikidata item:
 *
 * 1. by external ID — exact, then accent-insensitive — when exactly one item carries it;
 * 2. else, for a player past `minGamesForName` games, by NAME, when exactly one item of the
 *    sport WITHOUT an external ID carries it and no other player was matched to it.
 *
 * Nothing is guessed: an external ID two of our players share (a scraping slip) matches neither,
 * a name two items share matches no one, and an item two players end up on is dropped for both.
 * The name fallback exists for the well-known players whose item lacks the ID — Tom Wood's
 * (17 "Tom Wood" items) resolves only by ID, and is safe either way.
 */
export function matchPlayers(
  players: MatchCandidate[],
  itemsById: Map<string, string[]>,
  itemsWithoutIdByName: Map<string, string[]>,
  minGamesForName: number | null,
): Map<string, Match> {
  const exact = new Map<string, Set<string>>()
  const loose = new Map<string, Set<string>>()
  for (const [id, qids] of itemsById) {
    for (const qid of qids) {
      if (!exact.has(id)) exact.set(id, new Set())
      exact.get(id)!.add(qid)
      const key = normalizeExternalId(id)
      if (!loose.has(key)) loose.set(key, new Set())
      loose.get(key)!.add(qid)
    }
  }
  const byName = new Map<string, Set<string>>()
  for (const [name, qids] of itemsWithoutIdByName) {
    const key = normalizeName(name)
    if (!byName.has(key)) byName.set(key, new Set())
    for (const qid of qids) byName.get(key)!.add(qid)
  }

  const idCount = new Map<string, number>()
  for (const p of players) if (p.externalId) idCount.set(p.externalId, (idCount.get(p.externalId) ?? 0) + 1)

  const matches = new Map<string, Match>()
  for (const p of players) {
    if (!p.externalId || idCount.get(p.externalId)! > 1) continue
    const qids = exact.get(p.externalId) ?? loose.get(normalizeExternalId(p.externalId))
    if (qids && qids.size === 1) matches.set(p.playerId, { qid: [...qids][0], how: 'id' })
  }

  if (minGamesForName !== null) {
    const taken = new Set([...matches.values()].map((m) => m.qid))
    for (const p of players) {
      if (matches.has(p.playerId) || p.games < minGamesForName) continue
      const qids = [...(byName.get(normalizeName(p.name)) ?? [])].filter((q) => !taken.has(q))
      if (qids.length === 1) matches.set(p.playerId, { qid: qids[0], how: 'unique-name' })
    }
  }

  const owners = new Map<string, number>()
  for (const m of matches.values()) owners.set(m.qid, (owners.get(m.qid) ?? 0) + 1)
  for (const [playerId, m] of matches) if (owners.get(m.qid)! > 1) matches.delete(playerId)
  return matches
}

/** The months views are averaged over: the last `months` full months before `today`. */
export function viewWindow(today: Date, months = 36): { start: string; end: string; label: string; years: number } {
  const endMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)) // last day of previous month
  const startMonth = new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - months + 1, 1))
  const ym = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const ymd = (d: Date) => `${ym(d)}${String(d.getUTCDate()).padStart(2, '0')}`
  return { start: ymd(startMonth), end: ymd(endMonth), label: `${ym(startMonth)}-${ym(endMonth)}`, years: months / 12 }
}

/**
 * Views per year over the window, French and English summed — the languages of the game's
 * audience. Null when the item has no article in either: not measured, not zero.
 */
export function viewsPerYear(viewsByLanguage: Map<string, number>, years: number): number | null {
  const counted = ['fr', 'en'].filter((lang) => viewsByLanguage.has(lang))
  if (counted.length === 0) return null
  return Math.round(counted.reduce((sum, lang) => sum + viewsByLanguage.get(lang)!, 0) / years)
}
