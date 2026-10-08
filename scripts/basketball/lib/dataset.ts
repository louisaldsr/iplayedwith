import { Nationality } from '@/domain/nationality'
import { isAfterLatestSeason, LATEST_SEASON, Season } from '@/domain/season'
import type { SeedClub, SeedMembership, SeedPlayer } from '../../common/seedDataset'
import { capsByNation, type FibaPlayerPage, type FibaRankedNation } from './fiba'
import type { TeamSeasonPage } from './rosterParser'
import type { TotalsRow } from './totalsParser'

/** First season imported: 1979-80, the start of the modern era (three-point line, Bird and Magic). */
export const FIRST_SEASON = Season('1979-1980')

/** The only competition the source covers — the label on every membership, and the title won. */
export const COMPETITION = 'NBA'

/**
 * The `prestige_competitions` rows basketball writes under (029_basketball_fame.sql): the playoff
 * run plays the part of a European run, the Finals win is the title.
 */
export const PLAYOFFS_COMPETITION = 'NBA Playoffs'
export const TITLE_COMPETITION = COMPETITION

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

/** A membership with the club-performance inputs of fame v3 (`memberships.starts` / `.minutes`). */
export type BasketballMembership = SeedMembership & {
  /** Games started, regular season + playoffs. Null for the whole squad when any member's is unknown. */
  starts: number | null
  /** Minutes, regular season + playoffs. Null for the whole squad when any member's is unknown. */
  minutes: number | null
}

export type BasketballPlayer = SeedPlayer & {
  /** Senior FIBA games per national team (FIBA code). Null: no FIBA page, unknown — not "uncapped". */
  capsByNation: Record<string, number> | null
}

/** A club-season's playoff run — the basketball counterpart of a European run, for club prestige. */
export type ClubSeasonRun = { clubSourceId: string; season: Season; playoffWins: number; champion: boolean }

export type BasketballDataset = {
  generatedAt: string
  clubs: SeedClub[]
  players: BasketballPlayer[]
  memberships: BasketballMembership[]
  /** Only club-seasons that reached the playoffs. */
  clubSeasons: ClubSeasonRun[]
  /** The FIBA men's ranking at build time — the basketball rows of `nation_tiers`. */
  nations: FibaRankedNation[]
}

/** Both known → their sum; either unknown → unknown. */
const addKnown = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b)

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
 * - `starts` / `minutes` are all-or-nothing per squad: fame compares a player with the squad's
 *   most-used member, so a squad where some starts are blank (before 1981-82, older playoffs)
 *   would read those players as never starting. Such a squad falls back to minutes, which the
 *   score already does when starts are absent.
 * - Caps come from FIBA (`fibaPages`: player → each of their FIBA pages, parsed), keyed by the
 *   nation's FIBA code through `ranking`.
 */
export function buildDataset(
  seasons: SeasonPages[],
  fibaPages: Map<string, FibaPlayerPage[]> = new Map(),
  ranking: FibaRankedNation[] = [],
): { dataset: BasketballDataset; warnings: BuildWarning[] } {
  const warnings: BuildWarning[] = []
  const memberships = new Map<string, BasketballMembership>()
  const players = new Map<string, BasketballPlayer>()
  const clubSeasons: ClubSeasonRun[] = []
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
        capsByNation: null,
      })
      clubs.set(team.name, { sourceId: team.name, name: team.name, logoUrl: team.logoUrl, endYear })

      const key = `${row.playerId}||${team.name}||${season}`
      const existing = memberships.get(key)
      if (existing) {
        existing.games = (existing.games ?? 0) + row.games
        existing.starts = addKnown(existing.starts, row.starts)
        existing.minutes = addKnown(existing.minutes, row.minutes)
      } else
        memberships.set(key, {
          playerSourceId: row.playerId,
          clubSourceId: team.name,
          season,
          competition: COMPETITION,
          games: row.games,
          starts: row.starts,
          minutes: row.minutes,
        })
    }

    for (const team of new Set(teams.values())) {
      if (team.playoffWins > 0 || team.champion) {
        clubSeasons.push({ clubSourceId: team.name, season, playoffWins: team.playoffWins, champion: team.champion })
      }
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

  // All-or-nothing per squad, for starts and minutes separately.
  const squads = new Map<string, BasketballMembership[]>()
  for (const m of memberships.values()) {
    const key = `${m.clubSourceId}||${m.season}`
    squads.set(key, [...(squads.get(key) ?? []), m])
  }
  for (const squad of squads.values()) {
    if (squad.some((m) => m.starts === null)) for (const m of squad) m.starts = null
    if (squad.some((m) => m.minutes === null)) for (const m of squad) m.minutes = null
  }

  for (const [playerId, pages] of fibaPages) {
    const player = players.get(playerId)
    if (player) player.capsByNation = capsByNation(pages, ranking)
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
      clubSeasons: clubSeasons.sort(
        (a, b) => a.season.localeCompare(b.season) || a.clubSourceId.localeCompare(b.clubSourceId),
      ),
      nations: ranking,
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
