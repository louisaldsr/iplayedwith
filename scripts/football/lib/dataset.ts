import { Season } from '@/domain/season'
import { alpha2ForEnglishCountryName } from '../../common/nationalities'
import type { Appearance, Club, Game, Player } from './transfermarktDataset'

/**
 * The Big 5 domestic leagues, mapped to the display name stored on each membership.
 * `competitions.csv` only carries slugs ("premier-league"), so the labels live here.
 *
 * These ids also define the club scope: a club is in scope if it played at least one
 * game in one of these competitions. Once in scope, *all* of that club's appearances
 * count — domestic cup, Champions League, Europa League and so on.
 */
export const BIG5_LEAGUES: Record<string, string> = {
  GB1: 'Premier League',
  ES1: 'LaLiga',
  IT1: 'Serie A',
  L1: 'Bundesliga',
  FR1: 'Ligue 1',
}

/**
 * First season with real coverage. `games.csv` holds nothing before this except a
 * handful of national-team tournament matches, and spells reconstructed from
 * `transfers.csv` are far too sparse to be worth seeding (2 memberships for 2000/01),
 * so anything earlier is dropped rather than seeded as a near-empty squad.
 */
export const FIRST_SEASON_YEAR = 2012

/** Transfermarkt club crest, by club id — e.g. club 418 (Real Madrid). */
export function clubLogoUrl(clubId: string): string {
  return `https://tmssl.akamaized.net/images/wappen/head/${clubId}.png`
}

/**
 * Dataset seasons are the starting year as a string ("2012" is the 2012/13 season);
 * the domain's `Season` is "YYYY-YYYY". Returns null for an unparseable year or one
 * before `FIRST_SEASON_YEAR`, which is how out-of-scope rows get filtered out.
 */
export function seasonFromDatasetYear(raw: string): Season | null {
  if (!/^\d{4}$/.test(raw)) return null
  const year = Number(raw)
  if (year < FIRST_SEASON_YEAR) return null
  return Season(`${year}-${year + 1}`)
}

const clubSeasonKey = (clubId: string, season: string) => `${clubId}||${season}`

export type GameIndex = {
  /** Clubs that played at least one Big-5 league game — the club scope. */
  big5ClubIds: Set<string>
  /** gameId -> in-scope season, for games in a season we keep. */
  seasonByGameId: Map<string, Season>
  /** `clubId||season` -> Big-5 league display name, for the membership's competition label. */
  domesticLeagueByClubSeason: Map<string, string>
}

/**
 * Single pass over `games`: works out which clubs are in scope, which games belong to a
 * season we keep, and which Big-5 league each club played in each season.
 */
export function indexGames(games: Iterable<Game>): GameIndex {
  const big5ClubIds = new Set<string>()
  const seasonByGameId = new Map<string, Season>()
  const domesticLeagueByClubSeason = new Map<string, string>()

  for (const game of games) {
    const league = BIG5_LEAGUES[game.competitionId]
    if (league) {
      big5ClubIds.add(game.homeClubId)
      big5ClubIds.add(game.awayClubId)
    }

    const season = seasonFromDatasetYear(game.season)
    if (!season) continue
    seasonByGameId.set(game.gameId, season)

    if (league) {
      for (const clubId of [game.homeClubId, game.awayClubId]) {
        const key = clubSeasonKey(clubId, season)
        if (!domesticLeagueByClubSeason.has(key)) domesticLeagueByClubSeason.set(key, league)
      }
    }
  }

  return { big5ClubIds, seasonByGameId, domesticLeagueByClubSeason }
}

export type DerivedMembership = {
  playerTransfermarktId: string
  clubTransfermarktId: string
  season: Season
  competition: string | null
}

/**
 * Folds appearances (one row per player per game played) into distinct
 * (player, club, season) memberships — the unit the game's graph is built from.
 *
 * A player who moved mid-season legitimately produces two memberships for that season,
 * one per club; the memberships primary key is (player_id, club_id, season), so both
 * are kept. Appearances for clubs outside the Big-5 scope are ignored, as are games in
 * seasons before `FIRST_SEASON_YEAR`.
 */
export function createMembershipCollector(index: GameIndex) {
  const seen = new Map<string, DerivedMembership>()

  return {
    add(appearance: Appearance) {
      if (!index.big5ClubIds.has(appearance.playerClubId)) return
      const season = index.seasonByGameId.get(appearance.gameId)
      if (!season) return

      const key = `${appearance.playerId}||${appearance.playerClubId}||${season}`
      if (seen.has(key)) return

      seen.set(key, {
        playerTransfermarktId: appearance.playerId,
        clubTransfermarktId: appearance.playerClubId,
        season,
        competition: index.domesticLeagueByClubSeason.get(clubSeasonKey(appearance.playerClubId, season)) ?? null,
      })
    },
    /** Distinct memberships, ordered for a stable, diffable output file. */
    result(): DerivedMembership[] {
      return [...seen.values()].sort(
        (a, b) =>
          a.clubTransfermarktId.localeCompare(b.clubTransfermarktId) ||
          a.season.localeCompare(b.season) ||
          a.playerTransfermarktId.localeCompare(b.playerTransfermarktId),
      )
    },
  }
}

/**
 * Counts how many games each player actually played, as the fame metric's main signal.
 *
 * Deliberately applies the SAME scope filters as `createMembershipCollector`, off the same
 * single pass over the 1.9M-row appearances table: a game only counts if it is one the graph
 * could be built from. Counting out-of-scope appearances would rate a player on a career the
 * game knows nothing about — a Bundesliga 2 veteran would outrank a Premier League regular
 * while being unreachable in every puzzle.
 *
 * Unlike memberships, appearances are NOT deduped: three games in a season is three games.
 */
export function createAppearanceCounter(index: GameIndex) {
  const gamesByPlayer = new Map<string, number>()

  return {
    add(appearance: Appearance) {
      if (!index.big5ClubIds.has(appearance.playerClubId)) return
      if (!index.seasonByGameId.has(appearance.gameId)) return
      gamesByPlayer.set(appearance.playerId, (gamesByPlayer.get(appearance.playerId) ?? 0) + 1)
    },
    result(): Map<string, number> {
      return gamesByPlayer
    },
  }
}

export type DatasetClub = { transfermarktId: string; name: string; logoUrl: string }
export type DatasetPlayer = {
  transfermarktId: string
  name: string
  nationality: string | null
  /** Fame signals — see src/domain/fame.ts. */
  games: number
  caps: number
}
export type FootballDataset = {
  generatedAt: string
  clubs: DatasetClub[]
  players: DatasetPlayer[]
  memberships: DerivedMembership[]
}

export type BuildWarning = { kind: 'unknown-club' | 'unknown-player' | 'unmapped-nationality'; detail: string }

/**
 * Assembles the final dataset from the derived memberships, resolving club and player
 * names. Only clubs and players that actually carry a membership are emitted, so we
 * never seed a player row nothing links to.
 *
 * Nationality reuses `alpha2ForEnglishCountryName` — `country_of_citizenship` is an
 * English country name, the same shape all.rugby reports. Unmapped values are reported
 * as warnings and stored as null rather than failing the build.
 */
export function buildDataset(
  memberships: DerivedMembership[],
  clubsById: Map<string, Club>,
  playersById: Map<string, Player>,
  gamesByPlayer: Map<string, number> = new Map(),
): { dataset: FootballDataset; warnings: BuildWarning[] } {
  const warnings: BuildWarning[] = []
  const clubIds = new Set(memberships.map((m) => m.clubTransfermarktId))
  const playerIds = new Set(memberships.map((m) => m.playerTransfermarktId))

  const clubs: DatasetClub[] = []
  for (const clubId of [...clubIds].sort()) {
    const club = clubsById.get(clubId)
    if (!club) {
      warnings.push({ kind: 'unknown-club', detail: `club ${clubId} has memberships but no row in clubs.csv` })
      continue
    }
    clubs.push({ transfermarktId: clubId, name: club.name, logoUrl: clubLogoUrl(clubId) })
  }

  const players: DatasetPlayer[] = []
  // Unmapped nationalities repeat once per player; the actionable unit is the distinct
  // country name, so count them and report one line each.
  const unmappedNationalities = new Map<string, { count: number; example: string }>()

  for (const playerId of [...playerIds].sort()) {
    const player = playersById.get(playerId)
    if (!player) {
      warnings.push({ kind: 'unknown-player', detail: `player ${playerId} has memberships but no row in players.csv` })
      continue
    }
    const raw = player.countryOfCitizenship
    const nationality = raw ? alpha2ForEnglishCountryName(raw) : null
    if (raw && !nationality) {
      const seen = unmappedNationalities.get(raw)
      unmappedNationalities.set(raw, { count: (seen?.count ?? 0) + 1, example: seen?.example ?? player.name })
    }
    players.push({
      transfermarktId: playerId,
      name: player.name,
      nationality,
      games: gamesByPlayer.get(playerId) ?? 0,
      caps: player.caps,
    })
  }

  for (const [country, { count, example }] of [...unmappedNationalities].sort()) {
    warnings.push({
      kind: 'unmapped-nationality',
      detail: `"${country}" — ${count} player(s), e.g. ${example} — add it to scripts/lib/nationalities.ts`,
    })
  }

  // A membership pointing at a club or player we could not resolve would break the
  // seeding step's id lookup, so drop it here alongside its warning.
  const knownClubs = new Set(clubs.map((c) => c.transfermarktId))
  const knownPlayers = new Set(players.map((p) => p.transfermarktId))
  const kept = memberships.filter(
    (m) => knownClubs.has(m.clubTransfermarktId) && knownPlayers.has(m.playerTransfermarktId),
  )

  return { dataset: { generatedAt: new Date().toISOString(), clubs, players, memberships: kept }, warnings }
}
