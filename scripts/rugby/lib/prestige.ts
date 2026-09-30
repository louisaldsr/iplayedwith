import type { ContinentalWins } from '@/domain/prestige'

/**
 * The competition labels a profile uses for the continental stage, folded onto the names
 * `prestige_competitions` weighs (supabase/migrations/023_season_prestige.sql). Every spelling
 * found across the ~20k cached profiles, lower-cased.
 *
 * Super Rugby counts with its COVID-era replacements (Aotearoa, AU, Trans-Tasman), which were
 * the same franchises in the same slot. Left out: Super Rugby Unlocked (a South African domestic
 * tournament) and the one-off Rainbow Cup.
 */
const CONTINENTAL_LABELS: Record<string, string> = {
  'champions cup': 'Champions Cup',
  'h cup': 'Champions Cup',
  'heineken cup': 'Champions Cup',
  'challenge cup': 'Challenge Cup',
  'challenge européen': 'Challenge Cup',
  'european challenge cup': 'Challenge Cup',
  'super rugby': 'Super Rugby',
  'super rugby pacific': 'Super Rugby',
  'super rugby aotearoa': 'Super Rugby',
  'super rugby au': 'Super Rugby',
  'super rugby trans-tasman': 'Super Rugby',
}

/** The canonical continental competition of a profile label, or null for any other competition. */
export function continentalCompetitionOf(label: string): string | null {
  return CONTINENTAL_LABELS[label.trim().toLowerCase()] ?? null
}

/** One competition line of a player's career, with its club already resolved to an id. */
export type ResolvedCompetitionRow = { clubId: string; season: string; competition: string; wins: number | null }
export type SquadRun = { clubId: string; season: string; wins: ContinentalWins }

/**
 * Rebuilds each club-season's continental run — its WINS — from its players' profiles.
 *
 * No profile says how many games the CLUB won, only each player. The squad's run is taken as
 * the most wins any one of its players took part in: over a campaign someone plays nearly every
 * game, so this can only undercount by the odd game. Measured on the whole cache: Toulouse
 * 2023-24 8, Leinster 2017-18 9, Zebre 2016-17 0; Crusaders 2017 17, Sunwolves 2018 2.
 *
 * Per player, lines of the same competition are summed first — Super Rugby Aotearoa and
 * Trans-Tasman in one season are one Super Rugby season.
 */
export function createSquadRunCollector() {
  const best = new Map<string, number>()

  return {
    addPlayer(rows: ResolvedCompetitionRow[]) {
      const own = new Map<string, number>()
      for (const row of rows) {
        const competition = continentalCompetitionOf(row.competition)
        if (!competition || row.wins === null) continue
        const key = `${row.clubId}||${row.season}||${competition}`
        own.set(key, (own.get(key) ?? 0) + row.wins)
      }
      for (const [key, wins] of own) best.set(key, Math.max(best.get(key) ?? 0, wins))
    },

    runs(): SquadRun[] {
      const byClubSeason = new Map<string, SquadRun>()
      for (const [key, wins] of best) {
        if (wins === 0) continue
        const [clubId, season, competition] = key.split('||')
        const clubSeason = `${clubId}||${season}`
        const run = byClubSeason.get(clubSeason) ?? { clubId, season, wins: {} }
        run.wins[competition] = wins
        byClubSeason.set(clubSeason, run)
      }
      return [...byClubSeason.values()]
    },
  }
}
