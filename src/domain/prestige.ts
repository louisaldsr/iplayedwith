/**
 * How much of a spotlight a club-season was under — the stage a player played on.
 *
 * Scored per club-SEASON, not per club: people remember a season, its big European nights and
 * its title, and the squad that played them (docs/spikes/fame.md, "Revision 3"). Player fame
 * reads it as `stage`, the games-weighted average over the player's memberships.
 *
 * `PrestigeDetails` mirrors `club_season_prestige.details` (jsonb): the imported signals.
 * Titles are not in it — they have their own table (`club_titles`) and their own writers.
 *
 * As for fame, the formula lives only in SQL (`compute_season_prestige`,
 * supabase/migrations/023_season_prestige.sql), and so do the competition weights
 * (`prestige_competitions`): the game never reads a prestige score, only fame floors.
 */

/**
 * Continental games a club WON in one season, per competition, under the canonical names of
 * `prestige_competitions` ("Champions Cup", "Champions League"…). Wins, not games: counting games
 * rewarded taking part (Zebre 2016-17: 6 Champions Cup games, 0 wins). The club's run, not a
 * player's: the rugby import takes the most wins any squad member played in, the football one
 * counts the results.
 */
export type ContinentalWins = Record<string, number>

export type PrestigeDetails = {
  continentalWins?: ContinentalWins
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

/**
 * Reads a `details` value that came back from the database.
 *
 * Tolerant by design, like `parseFameDetails`: the bag is open and written by scripts, so an
 * unknown key is dropped and a malformed entry is skipped rather than thrown on.
 */
export function parsePrestigeDetails(raw: unknown): PrestigeDetails {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const bag = raw as Record<string, unknown>

  const details: PrestigeDetails = {}
  const wins = bag.continentalWins
  if (typeof wins === 'object' && wins !== null && !Array.isArray(wins)) {
    const continentalWins: ContinentalWins = {}
    for (const [competition, count] of Object.entries(wins)) {
      if (isCount(count)) continentalWins[competition] = count
    }
    details.continentalWins = continentalWins
  }
  return details
}
