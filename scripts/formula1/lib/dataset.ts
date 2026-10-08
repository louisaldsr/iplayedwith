import { Nationality } from '@/domain/nationality'
import { LATEST_SEASON, Season, startYear } from '@/domain/season'
import type { SeedClub, SeedMembership, SeedPlayer } from '../../common/seedDataset'
import { alpha2OfDemonym } from './nationalities'

/** First season imported: 1950, the first World Championship. */
export const FIRST_YEAR = 1950

/** The constructors' championship starts in 1958 — no standings page before. */
export const FIRST_CONSTRUCTORS_YEAR = 1958

/**
 * The last calendar season imported: the year `LATEST_SEASON` starts in. With "2025-2026", F1 stops
 * at 2025 — 2026 is the season still being raced (src/domain/season.ts).
 */
export const lastYear = (): number => startYear(LATEST_SEASON)

/** The label on every membership: the only championship the source covers. */
export const COMPETITION = 'Formula 1'

/**
 * The `prestige_competitions` rows Formula 1 writes under (031_formula1.sql): a constructor's Grand
 * Prix wins play the part of a European run, the constructors' title the part of a title.
 */
export const WINS_COMPETITION = 'Grand Prix wins'
export const TITLE_COMPETITION = "Constructors' Championship"

/**
 * The fame pillar a national team fills in other sports (caps × the nation's tier, per season) is
 * filled by the driver's own results: podiums, under this one entry of `capsByNation`, weighted 1
 * in `nation_tiers`. The formula is unchanged — only what the import writes into it.
 */
export const RESULTS_ENTRY = 'World Championship'

/**
 * Podiums are counted as if every season had this many races: 1950 had 7 Grands Prix, 2024 had 24,
 * and a podium rate is what makes a driver stand out — not the length of the calendar.
 */
export const REFERENCE_RACES_PER_SEASON = 20

/**
 * Results that are not a start: the car was entered but never took the start. They still make the
 * driver part of the constructor's season — he was on the team — but they are not games.
 */
const NOT_STARTED = /^(withdrew|did not (pre)?qualify|did not start|not qualified|excluded|not restarted)$/i

// ─── The source, as cached (the Ergast JSON shape Jolpica serves) ──────────────

export type JolpicaDriver = {
  driverId: string
  url?: string
  givenName: string
  familyName: string
  nationality?: string
}

export type JolpicaConstructor = { constructorId: string; url?: string; name: string }

export type JolpicaResult = {
  position?: string
  positionText?: string
  status: string
  Driver: JolpicaDriver
  Constructor: JolpicaConstructor
}

export type JolpicaRace = {
  season: string
  round: string
  raceName: string
  Circuit: { circuitId: string }
  Results: JolpicaResult[]
}

export type ResultsPage = { MRData: { total: string; RaceTable: { Races: JolpicaRace[] } } }

export type ConstructorStandingsPage = {
  MRData: {
    StandingsTable: {
      StandingsLists: {
        season: string
        ConstructorStandings: { position?: string; Constructor: JolpicaConstructor }[]
      }[]
    }
  }
}

/** Everything the build reads for one season, as cached. */
export type SeasonPages = { year: number; results: ResultsPage[]; standings: ConstructorStandingsPage | null }

// ─── The dataset ────────────────────────────────────────────────────────────────

/** A membership with the club-performance input of fame v3: races started for that constructor. */
export type Formula1Membership = SeedMembership & { starts: number; minutes: null }

export type Formula1Player = SeedPlayer & {
  /** The English Wikipedia article Jolpica links — how fame:exposure finds the driver's Wikidata item. */
  enwikiTitle: string | null
  /** Podiums, each season scaled to `REFERENCE_RACES_PER_SEASON` races (see `RESULTS_ENTRY`). */
  podiumsScaled: number
}

/**
 * A constructor's season, for club prestige: its Grand Prix wins out of the season's `races`, and
 * whether it won the title.
 */
export type ConstructorSeason = { clubSourceId: string; season: Season; wins: number; races: number; champion: boolean }

/** Wins as if the season had `REFERENCE_RACES_PER_SEASON` races, rounded: the prestige import takes whole counts. */
export function scaledWins(run: ConstructorSeason): number {
  return run.races > 0 ? Math.round((run.wins * REFERENCE_RACES_PER_SEASON) / run.races) : 0
}

export type Formula1Dataset = {
  generatedAt: string
  clubs: SeedClub[]
  players: Formula1Player[]
  memberships: Formula1Membership[]
  /** Only constructor-seasons with a win or the title. */
  constructorSeasons: ConstructorSeason[]
}

export type BuildWarning = { kind: 'unknown-nationality' | 'duplicate-club-name'; detail: string }

/**
 * The Indianapolis 500 counted for the World Championship from 1950 to 1960, run by American
 * drivers and constructors who almost never raced anywhere else in it. Kept, they would be ~150
 * names linked to no one in the rest of F1 — so the import drops those races.
 */
export function isIndianapolis500(race: JolpicaRace): boolean {
  return race.Circuit.circuitId === 'indianapolis' && Number(race.season) <= 1960
}

/**
 * Folds the cached pages into the dataset the shared seeding steps read.
 *
 * - A club is a Jolpica constructor (`constructorId`), named as Jolpica names it. A team that
 *   changed name is a new constructor there (Toleman → Benetton → Renault), so the player types
 *   the name used that season — as basketball does with franchises.
 * - A membership is (driver, constructor, year): every driver entered by the constructor that
 *   season. `games` = `starts` = the races he started for it.
 * - Races are merged across pages first: Jolpica pages results, so one race can span two pages.
 */
export function buildDataset(seasons: SeasonPages[]): { dataset: Formula1Dataset; warnings: BuildWarning[] } {
  const warnings: BuildWarning[] = []
  const clubs = new Map<string, SeedClub>()
  const players = new Map<string, Formula1Player>()
  const memberships = new Map<string, Formula1Membership>()
  const constructorSeasons: ConstructorSeason[] = []
  const unknownNationalities = new Map<string, number>()

  for (const { year, results, standings } of [...seasons].sort((a, b) => a.year - b.year)) {
    const season = Season(String(year))
    const races = mergeRaces(results.flatMap((page) => page.MRData.RaceTable.Races)).filter(
      (race) => !isIndianapolis500(race),
    )
    const podiums = new Map<string, number>()
    const wins = new Map<string, number>()

    for (const race of races) {
      for (const result of race.Results) {
        const { Driver: driver, Constructor: constructor } = result
        clubs.set(constructor.constructorId, { sourceId: constructor.constructorId, name: constructor.name.trim() })

        if (!players.has(driver.driverId)) {
          const nationality = toNationality(driver.nationality)
          if (driver.nationality && !nationality) {
            unknownNationalities.set(driver.nationality, (unknownNationalities.get(driver.nationality) ?? 0) + 1)
          }
          players.set(driver.driverId, {
            sourceId: driver.driverId,
            name: `${driver.givenName} ${driver.familyName}`.trim(),
            nationality,
            enwikiTitle: enwikiTitleOf(driver.url),
            podiumsScaled: 0,
          })
        }

        const key = `${driver.driverId}|${constructor.constructorId}|${season}`
        const membership = memberships.get(key) ?? {
          playerSourceId: driver.driverId,
          clubSourceId: constructor.constructorId,
          season,
          competition: COMPETITION,
          games: 0,
          starts: 0,
          minutes: null,
        }
        if (!NOT_STARTED.test(result.status.trim())) {
          membership.starts++
          membership.games = membership.starts
        }
        memberships.set(key, membership)

        // The classified place: positionText is "R", "W", "D"… for a car that retired, withdrew or was
        // disqualified, while `position` still numbers every car — a disqualified winner keeps a 1.
        const position = Number(result.positionText ?? result.position)
        if (position >= 1 && position <= 3) podiums.set(driver.driverId, (podiums.get(driver.driverId) ?? 0) + 1)
        if (position === 1) wins.set(constructor.constructorId, (wins.get(constructor.constructorId) ?? 0) + 1)
      }
    }

    const scale = races.length > 0 ? REFERENCE_RACES_PER_SEASON / races.length : 0
    for (const [driverId, count] of podiums) players.get(driverId)!.podiumsScaled += count * scale

    const champion = championOf(standings)
    for (const constructorId of new Set([...wins.keys(), ...(champion ? [champion] : [])])) {
      constructorSeasons.push({
        clubSourceId: constructorId,
        season,
        wins: wins.get(constructorId) ?? 0,
        races: races.length,
        champion: constructorId === champion,
      })
    }
  }

  for (const [demonym, count] of unknownNationalities) {
    warnings.push({ kind: 'unknown-nationality', detail: `"${demonym}" (${count} driver(s))` })
  }
  // Club names are unique per sport (createClub adopts an existing name): two constructors sharing
  // one would be seeded as one club. Jolpica's names are distinct — this says so if that changes.
  const byName = new Map<string, string[]>()
  for (const club of clubs.values()) byName.set(club.name, [...(byName.get(club.name) ?? []), club.sourceId])
  for (const [name, ids] of byName) {
    if (ids.length > 1) warnings.push({ kind: 'duplicate-club-name', detail: `"${name}": ${ids.join(', ')}` })
  }

  return {
    dataset: {
      generatedAt: new Date().toISOString(),
      clubs: [...clubs.values()],
      players: [...players.values()].map((p) => ({ ...p, podiumsScaled: Math.round(p.podiumsScaled * 100) / 100 })),
      memberships: [...memberships.values()],
      constructorSeasons,
    },
    warnings,
  }
}

/** One race per (season, round), its results gathered from every page it spans. */
function mergeRaces(races: JolpicaRace[]): JolpicaRace[] {
  const byRound = new Map<string, JolpicaRace>()
  for (const race of races) {
    const key = `${race.season}|${race.round}`
    const seen = byRound.get(key)
    if (seen) seen.Results = [...seen.Results, ...race.Results]
    else byRound.set(key, { ...race, Results: [...race.Results] })
  }
  return [...byRound.values()]
}

/** The constructor that finished first in the final standings, if the season had a championship. */
function championOf(standings: ConstructorStandingsPage | null): string | null {
  const lists = standings?.MRData.StandingsTable.StandingsLists ?? []
  const first = lists[0]?.ConstructorStandings.find((row) => row.position === '1')
  return first?.Constructor.constructorId ?? null
}

/**
 * The article title in an English Wikipedia URL, decoded, underscores as spaces:
 * "http://en.wikipedia.org/wiki/Kimi_R%C3%A4ikk%C3%B6nen" → "Kimi Räikkönen". Null for anything else.
 */
export function enwikiTitleOf(url: string | undefined): string | null {
  const match = url?.match(/^https?:\/\/en\.wikipedia\.org\/wiki\/(.+)$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1]).replace(/_/g, ' ')
  } catch {
    return null
  }
}

function toNationality(demonym: string | undefined): Nationality | null {
  const code = demonym ? alpha2OfDemonym(demonym) : null
  if (!code) return null
  try {
    return Nationality(code)
  } catch {
    return null
  }
}
