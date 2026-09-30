import type { ContinentalWins } from '@/domain/prestige'
import { BIG5_LEAGUES, seasonFromDatasetYear } from './dataset'
import type { GameResult } from './transfermarktDataset'

/**
 * The UEFA club competitions, by Transfermarkt id, under the names `prestige_competitions`
 * weighs them (supabase/migrations/023_season_prestige.sql). Qualifying rounds (CLQ, ELQ, ECLQ)
 * are left out: a club knocked out in August was not under the spotlight the competition gives.
 */
export const CONTINENTAL_COMPETITIONS: Record<string, string> = {
  CL: 'Champions League',
  EL: 'Europa League',
  UCOL: 'Conference League',
}

/** A club's continental run in one season — its wins — keyed by Transfermarkt club id. */
export type ContinentalRun = { clubId: string; season: string; wins: ContinentalWins }
export type DerivedTitle = { clubId: string; season: string; competition: string }
export type TitleWarning = { kind: 'final' | 'league'; detail: string }

/**
 * Counts the continental WINS of every in-scope club, per season and competition — a draw counts
 * for nothing, a shoot-out win counts (it is in the score). Wins rather than games, so a
 * group-stage exit does not read like a run.
 *
 * Only the Big-5 clubs the game knows are in scope (`inScope`): Ajax's run is not needed, and
 * the DB would skip it anyway. Seasons outside the data window are dropped by
 * `seasonFromDatasetYear`, the same filter the memberships went through.
 */
export function collectContinentalRuns(
  games: Iterable<GameResult>,
  inScope: (clubId: string) => boolean,
): ContinentalRun[] {
  const runs = new Map<string, ContinentalRun>()

  for (const game of games) {
    const competition = CONTINENTAL_COMPETITIONS[game.competitionId]
    if (!competition) continue
    const season = seasonFromDatasetYear(game.season)
    if (!season) continue
    if (game.homeGoals === null || game.awayGoals === null || game.homeGoals === game.awayGoals) continue

    const winner = game.homeGoals > game.awayGoals ? game.homeClubId : game.awayClubId
    if (!inScope(winner)) continue
    const key = `${winner}||${season}`
    const run = runs.get(key) ?? { clubId: winner, season, wins: {} }
    run.wins[competition] = (run.wins[competition] ?? 0) + 1
    runs.set(key, run)
  }

  return [...runs.values()]
}

/**
 * Derives the titles won by in-scope clubs from the results: the winner of each continental
 * final, and the champion of each Big-5 league season.
 *
 * Anything that cannot be decided cleanly is left out with a warning rather than guessed: a
 * drawn final (the shoot-out is in the score, so this means a data gap), a competition-season
 * with two finals, or a league season not played to the end — the latest season can be in
 * progress when the dataset is built, and its leader is not its champion.
 */
export function deriveTitles(
  games: Iterable<GameResult>,
  inScope: (clubId: string) => boolean,
): { titles: DerivedTitle[]; warnings: TitleWarning[] } {
  const titles: DerivedTitle[] = []
  const warnings: TitleWarning[] = []

  const finals = new Map<string, GameResult[]>()
  const leagues = new Map<string, Map<string, { played: number; lastDate: string; lastPosition: number | null }>>()

  for (const game of games) {
    const season = seasonFromDatasetYear(game.season)
    if (!season) continue

    const cup = CONTINENTAL_COMPETITIONS[game.competitionId]
    if (cup && game.round.trim().toLowerCase() === 'final') {
      const key = `${cup}||${season}`
      finals.set(key, [...(finals.get(key) ?? []), game])
      continue
    }

    const league = BIG5_LEAGUES[game.competitionId]
    if (!league) continue
    const key = `${league}||${season}`
    const table = leagues.get(key) ?? new Map()
    leagues.set(key, table)
    for (const [clubId, position] of [
      [game.homeClubId, game.homePosition],
      [game.awayClubId, game.awayPosition],
    ] as const) {
      const club = table.get(clubId) ?? { played: 0, lastDate: '', lastPosition: null }
      club.played++
      if (game.date >= club.lastDate) {
        club.lastDate = game.date
        club.lastPosition = position
      }
      table.set(clubId, club)
    }
  }

  for (const [key, games] of finals) {
    const [competition, season] = key.split('||')
    if (games.length !== 1) {
      warnings.push({ kind: 'final', detail: `${competition} ${season}: ${games.length} finals` })
      continue
    }
    const [final] = games
    if (final.homeGoals === null || final.awayGoals === null || final.homeGoals === final.awayGoals) {
      warnings.push({ kind: 'final', detail: `${competition} ${season}: no winner in the score` })
      continue
    }
    const winner = final.homeGoals > final.awayGoals ? final.homeClubId : final.awayClubId
    if (inScope(winner)) titles.push({ clubId: winner, season, competition })
  }

  for (const [key, table] of leagues) {
    const [competition, season] = key.split('||')
    // A double round-robin: every club plays every other twice.
    const expected = 2 * (table.size - 1)
    const unfinished = [...table.values()].filter((club) => club.played < expected).length
    if (unfinished > 0) {
      warnings.push({
        kind: 'league',
        detail: `${competition} ${season}: ${unfinished} club(s) short of ${expected} games`,
      })
      continue
    }
    const champions = [...table.entries()].filter(([, club]) => club.lastPosition === 1).map(([clubId]) => clubId)
    if (champions.length !== 1) {
      warnings.push({ kind: 'league', detail: `${competition} ${season}: ${champions.length} club(s) finish first` })
      continue
    }
    if (inScope(champions[0])) titles.push({ clubId: champions[0], season, competition })
  }

  return { titles, warnings }
}
