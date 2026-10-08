import { Club } from './club'
import { Season, startYear } from './season'

/**
 * An unbroken run of seasons at one club — how a career reads: "2015 – 2020, Stade Toulousain".
 *
 * Built from memberships (one per club and season), so a player who left a club and came back
 * has two stints there, and a loan inside a season shows as its own stint next to the parent club.
 */
export type CareerStint = {
  club: Club
  /** First season of the run. */
  from: Season
  /** Last season of the run — equal to `from` for a single season. */
  to: Season
  /** Games over the run; null when the source gave no count for any of its seasons. */
  games: number | null
}

type CareerRow = { club: Club; season: Season; games?: number | null }

/**
 * Groups a player's club-seasons into stints, oldest first.
 *
 * Seasons at the same club merge only when consecutive: 2015-2016 and 2016-2017 are one stint,
 * 2015-2016 and 2018-2019 are two — and the same for calendar seasons, 2015 and 2016.
 */
export function toCareerStints(rows: CareerRow[]): CareerStint[] {
  const sorted = [...rows].sort(
    (a, b) => startYear(a.season) - startYear(b.season) || a.club.name.localeCompare(b.club.name),
  )

  const stints: CareerStint[] = []
  const openByClub = new Map<string, CareerStint>()

  for (const row of sorted) {
    const open = openByClub.get(row.club.id)
    if (open && startYear(row.season) === startYear(open.to) + 1) {
      open.to = row.season
      open.games = addGames(open.games, row.games)
      continue
    }
    const stint: CareerStint = { club: row.club, from: row.season, to: row.season, games: row.games ?? null }
    stints.push(stint)
    openByClub.set(row.club.id, stint)
  }

  return stints
}

/** Null only while every season so far is unknown: one known count makes the total a number. */
function addGames(total: number | null, games: number | null | undefined): number | null {
  if (games === null || games === undefined) return total
  return (total ?? 0) + games
}
