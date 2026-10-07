import { Nationality } from '@/domain/nationality'
import { isAfterLatestSeason, LATEST_SEASON, Season } from '@/domain/season'
import type { SeedClub, SeedDataset, SeedMembership, SeedPlayer } from '../../common/seedDataset'
import type { TeamSeasonPage } from './rosterParser'
import type { TotalsRow } from './totalsParser'

/** First season imported: 1979-80, the start of the modern era (three-point line, Bird and Magic). */
export const FIRST_SEASON = Season('1979-1980')

/** The only competition the source covers. */
export const COMPETITION = 'NBA'

/**
 * The most games one player can play for one team in one season: 82 in the regular season plus
 * four best-of-seven playoff rounds. Anything above is a parsing bug, not a season.
 */
const MAX_GAMES_PER_TEAM_SEASON = 82 + 4 * 7

const endYearOf = (season: Season): number => Number(season.slice(5))

export const firstEndYear = (): number => endYearOf(FIRST_SEASON)
export const lastEndYear = (): number => endYearOf(LATEST_SEASON)

/** Basketball-Reference's end year → our `Season`. 1980 → "1979-1980". */
export function seasonFromEndYear(endYear: number): Season {
  return Season(`${endYear - 1}-${endYear}`)
}

/** Everything the build reads for one season, already parsed. */
export type SeasonPages = {
  endYear: number
  totals: TotalsRow[]
  /** Keyed by team abbreviation, as the totals rows reference them. */
  teams: Map<string, TeamSeasonPage>
}

export type BuildWarning = { kind: 'missing-team-page' | 'unknown-country-code'; detail: string }

export type BasketballDataset = SeedDataset & { generatedAt: string }

/**
 * Folds parsed pages into the dataset the shared seeding steps read.
 *
 * - A membership is (player, team NAME, season). `games` = regular season + playoffs for that
 *   team — the "all competitions" contract of migration 011.
 * - A club is a team NAME, not an abbreviation and not a franchise. A renamed franchise
 *   (SuperSonics → Thunder) stays two clubs, so the player types the name used that season; two
 *   eras sharing a name (the Baltimore Bullets of 1947-55 and 1963-73) become one club, which is
 *   harmless because their seasons never overlap. The name is also the club's `sourceId`.
 * - A player's nationality is the birth country on their latest roster that has one.
 */
export function buildDataset(seasons: SeasonPages[]): { dataset: BasketballDataset; warnings: BuildWarning[] } {
  const warnings: BuildWarning[] = []
  const memberships = new Map<string, SeedMembership>()
  const players = new Map<string, SeedPlayer>()
  // Latest season seen per club, so its logo is the most recent one.
  const clubs = new Map<string, SeedClub & { endYear: number }>()
  const unknownCountries = new Map<string, number>()

  for (const { endYear, totals, teams } of [...seasons].sort((a, b) => a.endYear - b.endYear)) {
    const season = seasonFromEndYear(endYear)
    if (isAfterLatestSeason(season)) continue

    for (const row of totals) {
      const team = teams.get(row.teamAbbr)
      if (!team) {
        warnings.push({ kind: 'missing-team-page', detail: `${row.teamAbbr} ${endYear}` })
        continue
      }

      // Later seasons overwrite earlier ones: the name a player is listed under most recently.
      players.set(row.playerId, {
        sourceId: row.playerId,
        name: row.name,
        nationality: players.get(row.playerId)?.nationality ?? null,
      })
      clubs.set(team.name, { sourceId: team.name, name: team.name, logoUrl: team.logoUrl, endYear })

      const key = `${row.playerId}||${team.name}||${season}`
      const existing = memberships.get(key)
      if (existing) existing.games = (existing.games ?? 0) + row.games
      else
        memberships.set(key, {
          playerSourceId: row.playerId,
          clubSourceId: team.name,
          season,
          competition: COMPETITION,
          games: row.games,
        })
    }

    for (const team of teams.values()) {
      for (const entry of team.roster) {
        const player = players.get(entry.playerId)
        if (!player || !entry.countryCode) continue
        const nationality = toNationality(entry.countryCode)
        if (nationality) player.nationality = nationality
        else unknownCountries.set(entry.countryCode, (unknownCountries.get(entry.countryCode) ?? 0) + 1)
      }
    }
  }

  for (const [code, count] of [...unknownCountries].sort()) {
    warnings.push({ kind: 'unknown-country-code', detail: `"${code}" on ${count} roster row(s)` })
  }

  const membershipList = [...memberships.values()].sort(
    (a, b) =>
      a.clubSourceId.localeCompare(b.clubSourceId) ||
      a.season.localeCompare(b.season) ||
      a.playerSourceId.localeCompare(b.playerSourceId),
  )
  for (const m of membershipList) {
    if ((m.games ?? 0) > MAX_GAMES_PER_TEAM_SEASON) {
      throw new Error(
        `${m.playerSourceId} played ${m.games} games for ${m.clubSourceId} in ${m.season} — ` +
          `more than ${MAX_GAMES_PER_TEAM_SEASON} is impossible, the parser is reading the wrong column`,
      )
    }
  }

  return {
    dataset: {
      generatedAt: new Date().toISOString(),
      clubs: [...clubs.values()]
        .map(({ sourceId, name, logoUrl }) => ({ sourceId, name, logoUrl }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      players: [...players.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
      memberships: membershipList,
    },
    warnings,
  }
}

function toNationality(countryCode: string): string | null {
  try {
    return Nationality(countryCode)
  } catch {
    return null
  }
}
