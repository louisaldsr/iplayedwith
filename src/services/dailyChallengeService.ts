import { SupabaseClient } from '@supabase/supabase-js'
import * as dailyChallengesRepo from '@/repositories/dailyChallengesRepository'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import { StoredDailyChallenge } from '@/repositories/dailyChallengesRepository'
import { SportId } from '@/domain/sport'
import { PlayerId } from '@/domain/ids'
import { Player } from '@/domain/player'
import { DailyChallenge, challengeDayOf, isPlayableDay } from '@/domain/dailyChallenge'
import { DailyArchive } from '@/domain/dailyArchive'
import { VisitorId } from '@/domain/dailyResult'
import { NotFoundError } from '@/services/errors'

/**
 * Today's challenge for the sport, drawing it if this is the day's first request.
 *
 * `now` is a parameter so the day boundary can be tested; callers leave it out.
 */
export async function getDailyChallenge(
  db: SupabaseClient,
  sport: SportId,
  now: Date = new Date(),
): Promise<DailyChallenge> {
  const stored = await dailyChallengesRepo.getOrGenerate(db, sport, challengeDayOf(now))
  const players = await playersRepo.findManyByIds(db, [stored.playerAId, stored.playerBId])
  return toChallenge(stored, new Map(players.map((p) => [p.id, p])))
}

/**
 * The challenge a shared link names (`/rugby/412`), or null for a number with no challenge yet.
 *
 * Tomorrow's pair is drawn ahead of time (013): a number past today is null like one never drawn,
 * or a link would show tomorrow's pair before midnight. Read only, never drawn.
 */
export async function getSharedChallenge(
  db: SupabaseClient,
  sport: SportId,
  number: number,
  now: Date = new Date(),
): Promise<DailyChallenge | null> {
  const stored = await dailyChallengesRepo.findByNumber(db, sport, number)
  if (!stored || !isPlayableDay(stored.day, challengeDayOf(now))) return null

  const players = await playersRepo.findManyByIds(db, [stored.playerAId, stored.playerBId])
  return toChallenge(stored, new Map(players.map((p) => [p.id, p])))
}

/**
 * Every challenge of the sport up to today, newest first, with the visitor's result on each — the
 * archive. Without a visitor (no storage in the browser), the days alone.
 *
 * Also what a past day is played from: its pair, and whether the server already counts it as
 * finished for this visitor. Never tomorrow's, already drawn.
 */
export async function getDailyArchive(
  db: SupabaseClient,
  sport: SportId,
  visitorId: VisitorId | null,
  now: Date = new Date(),
): Promise<DailyArchive> {
  const today = challengeDayOf(now)
  const [stored, results] = await Promise.all([
    dailyChallengesRepo.listUpTo(db, sport, today),
    visitorId ? dailyResultsRepo.visitorDays(db, sport, visitorId) : [],
  ])

  const players = await findPlayers(
    db,
    stored.flatMap((c) => [c.playerAId, c.playerBId]),
  )
  const resultOf = new Map(results.map((r) => [r.day, r]))
  return {
    today,
    days: stored.map((c) => {
      const r = resultOf.get(c.day)
      return {
        ...toChallenge(c, players),
        result: r ? { outcome: r.outcome, score: r.score, livesLost: r.livesLost, late: r.late } : null,
      }
    }),
  }
}

// Ids go in the query string (`in.(…)`): batched, so a long archive stays under URL limits.
const PLAYER_BATCH = 150

async function findPlayers(db: SupabaseClient, ids: PlayerId[]): Promise<Map<PlayerId, Player>> {
  const unique = [...new Set(ids)]
  const batches: PlayerId[][] = []
  for (let i = 0; i < unique.length; i += PLAYER_BATCH) batches.push(unique.slice(i, i + PLAYER_BATCH))
  const found = await Promise.all(batches.map((batch) => playersRepo.findManyByIds(db, batch)))
  return new Map(found.flat().map((p) => [p.id, p]))
}

function toChallenge(stored: StoredDailyChallenge, players: Map<PlayerId, Player>): DailyChallenge {
  const playerA = players.get(stored.playerAId)
  const playerB = players.get(stored.playerBId)
  // Unreachable while the foreign keys hold; guards against a player deleted from under a
  // stored challenge.
  if (!playerA || !playerB) {
    throw new NotFoundError(`a player of the ${stored.sport} challenge for ${stored.day} no longer exists`)
  }
  return {
    sport: stored.sport,
    day: stored.day,
    number: stored.number,
    playerA,
    playerB,
    optimalLinks: stored.optimalLinks,
  }
}
