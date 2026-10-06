import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
import { parse } from 'csv-parse'
import { inputPath } from '../../common/paths'

/**
 * The six tables of the dcaribou/transfermarkt-datasets build that the football import
 * reads. The archive holds twelve; the rest (game_lineups, game_events, valuations,
 * transfers, club_games, countries) carry nothing this game needs. `national_teams` gives the
 * FIFA ranking the fame score weighs caps by.
 */
export const DATASET_FILES = [
  'competitions.csv.gz',
  'clubs.csv.gz',
  'games.csv.gz',
  'appearances.csv.gz',
  'players.csv.gz',
  'national_teams.csv.gz',
] as const

export type DatasetFile = (typeof DATASET_FILES)[number]

/** `scripts/input/football/` — where `fetchDataset.ts` extracts the tables. */
export function footballInputDir(): string {
  return inputPath('football')
}

function datasetPath(file: DatasetFile): string {
  const filePath = path.join(footballInputDir(), file)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${file} in ${footballInputDir()} — run "npm run seed:football:fetch" first.`)
  }
  return filePath
}

/**
 * Streams a gzipped dataset table row by row, so the 1.9M-row `appearances` table never
 * has to be held in memory. Rows arrive as `Record<column, string>` (csv-parse's
 * `columns: true`), with empty CSV fields as empty strings.
 */
async function streamCsv(file: DatasetFile, onRow: (row: Record<string, string>) => void): Promise<void> {
  await pipeline(
    fs.createReadStream(datasetPath(file)),
    zlib.createGunzip(),
    parse({ columns: true, skipEmptyLines: true }),
    new Writable({
      objectMode: true,
      write(row: Record<string, string>, _encoding, callback) {
        try {
          onRow(row)
          callback()
        } catch (err) {
          callback(err as Error)
        }
      },
    }),
  )
}

export type Competition = { competitionId: string; slug: string; type: string; countryName: string }
export type Club = { clubId: string; name: string }
export type Game = { gameId: string; competitionId: string; season: string; homeClubId: string; awayClubId: string }
export type Player = {
  playerId: string
  name: string
  countryOfCitizenship: string
  caps: number
  /** The national team the player last played for; empty for most retired players. */
  currentNationalTeamId: string
}
export type Appearance = { playerId: string; playerClubId: string; gameId: string; minutesPlayed: number }
export type NationalTeam = { nationalTeamId: string; name: string; countryName: string; fifaRanking: number | null }

/**
 * Note on the `name` column: in `competitions.csv` it holds a slug ("premier-league"),
 * not a display name — hence `slug` here, and hence the explicit display-name map in
 * `buildFootballDataset.ts`.
 */
export async function loadCompetitions(): Promise<Map<string, Competition>> {
  const byId = new Map<string, Competition>()
  await streamCsv('competitions.csv.gz', (row) => {
    byId.set(row.competition_id, {
      competitionId: row.competition_id,
      slug: row.name,
      type: row.type,
      countryName: row.country_name,
    })
  })
  return byId
}

export async function loadClubs(): Promise<Map<string, Club>> {
  const byId = new Map<string, Club>()
  await streamCsv('clubs.csv.gz', (row) => {
    byId.set(row.club_id, { clubId: row.club_id, name: row.name })
  })
  return byId
}

export async function streamGames(onGame: (game: Game) => void): Promise<void> {
  await streamCsv('games.csv.gz', (row) => {
    onGame({
      gameId: row.game_id,
      competitionId: row.competition_id,
      season: row.season,
      homeClubId: row.home_club_id,
      awayClubId: row.away_club_id,
    })
  })
}

/**
 * A game with its outcome, for the season prestige: the round and score to find cup winners,
 * the date and league positions to find champions.
 *
 * `homeGoals`/`awayGoals` include a penalty shoot-out — the 2016 Champions League final reads
 * 6:4 — so a final never reads as a draw. `homePosition`/`awayPosition` are each club's league
 * position after the game, null outside domestic leagues.
 */
export type GameResult = Game & {
  round: string
  date: string
  homeGoals: number | null
  awayGoals: number | null
  homePosition: number | null
  awayPosition: number | null
}

const parseOptionalInt = (raw: string): number | null => (/^\d+$/.test(raw) ? parseInt(raw, 10) : null)

export async function streamGameResults(onGame: (game: GameResult) => void): Promise<void> {
  await streamCsv('games.csv.gz', (row) => {
    onGame({
      gameId: row.game_id,
      competitionId: row.competition_id,
      season: row.season,
      homeClubId: row.home_club_id,
      awayClubId: row.away_club_id,
      round: row.round,
      date: row.date,
      homeGoals: parseOptionalInt(row.home_club_goals),
      awayGoals: parseOptionalInt(row.away_club_goals),
      homePosition: parseOptionalInt(row.home_club_position),
      awayPosition: parseOptionalInt(row.away_club_position),
    })
  })
}

export async function streamAppearances(onAppearance: (appearance: Appearance) => void): Promise<void> {
  await streamCsv('appearances.csv.gz', (row) => {
    onAppearance({
      playerId: row.player_id,
      playerClubId: row.player_club_id,
      gameId: row.game_id,
      minutesPlayed: parseOptionalInt(row.minutes_played) ?? 0,
    })
  })
}

/**
 * Loads players, optionally keeping only the ids the caller cares about (~11k of ~50k).
 *
 * `international_caps` is a snapshot of the player's current national-team record, and is
 * blank for 61% of the table's 50k rows — a missing value is read as 0 rather than dropped,
 * which is why the fame formula only gives caps a partial weight.
 */
export async function loadPlayers(keep?: (playerId: string) => boolean): Promise<Map<string, Player>> {
  const byId = new Map<string, Player>()
  await streamCsv('players.csv.gz', (row) => {
    if (keep && !keep(row.player_id)) return
    const caps = parseInt(row.international_caps, 10)
    byId.set(row.player_id, {
      playerId: row.player_id,
      name: row.name,
      countryOfCitizenship: row.country_of_citizenship,
      caps: Number.isFinite(caps) && caps > 0 ? caps : 0,
      currentNationalTeamId: row.current_national_team_id,
    })
  })
  return byId
}

/** The national teams, with the FIFA ranking as of the dataset build. */
export async function loadNationalTeams(): Promise<Map<string, NationalTeam>> {
  const byId = new Map<string, NationalTeam>()
  await streamCsv('national_teams.csv.gz', (row) => {
    byId.set(row.national_team_id, {
      nationalTeamId: row.national_team_id,
      name: row.name,
      countryName: row.country_name,
      fifaRanking: parseOptionalInt(row.fifa_ranking),
    })
  })
  return byId
}
