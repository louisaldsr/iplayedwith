import { SupabaseClient } from '@supabase/supabase-js'
import * as dailyChallengesRepo from '@/repositories/dailyChallengesRepository'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { SportId } from '@/domain/sport'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { VisitorId } from '@/domain/dailyResult'
import { DailySolution, edgesOfChain, linksOfChain } from '@/domain/dailySolution'
import { ForbiddenError, NotFoundError } from '@/services/errors'

/**
 * The day's stored solution, for a visitor whose day is over — won or lost, as the SERVER
 * recorded it (`daily_results`), never as the browser says. Before that, it would give the answer
 * away.
 *
 * Known gap, accepted until accounts: a visitor is a browser. Losing on purpose in a private
 * window (three wrong guesses) shows the solution, to replay perfectly elsewhere.
 */
export async function getDailySolution(
  db: SupabaseClient,
  sport: SportId,
  day: ChallengeDay,
  visitorId: VisitorId,
): Promise<DailySolution> {
  const outcome = await dailyResultsRepo.findOutcome(db, sport, day, visitorId)
  if (!outcome) throw new ForbiddenError(`the ${sport} challenge of ${day} is not over for this visitor`)

  const chain = await dailyChallengesRepo.findSolution(db, sport, day)
  if (!chain) throw new NotFoundError(`no ${sport} challenge on ${day}`)

  const [players, memberships] = await Promise.all([
    playersRepo.findManyByIds(db, chain),
    membershipsRepo.listForPlayers(db, sport, chain),
  ])
  const links = linksOfChain(chain, memberships)
  // Unreachable while the data holds: the chain was a real one when drawn.
  if (!links) throw new Error(`the ${sport} solution of ${day} no longer holds`)

  const clubs = await clubsRepo.findManyByIds(db, [...new Set(links.map((l) => l.clubId))])
  const ordered = chain.map((id) => players.find((p) => p.id === id))
  if (ordered.some((p) => !p)) throw new Error(`a player of the ${sport} solution of ${day} no longer exists`)

  return { path: chain, players: ordered.map((p) => p!), clubs, edges: edgesOfChain(chain, links) }
}
