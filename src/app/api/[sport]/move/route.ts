import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { PlayerId, ClubId } from '@/domain/ids'
import { Season, isSeason } from '@/domain/season'
import { applyMove, type GraphState, type MoveRequest } from '@/services/moveService'
import { recordDailyMove } from '@/services/dailyResultService'
import { isVisitorId, VisitorId } from '@/domain/dailyResult'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { UserInput } from '@/game/userInput'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/move
 *
 * Plays one move and returns the node and edges it added, plus whether it won the game.
 *
 * The game graph is held by the client and sent with each move, so there is no session to
 * store or expire. Nothing here trusts that payload: `applyMove` re-checks every submitted
 * edge against the database before using it.
 *
 * A daily move carries `daily: { visitorId, day }`: once judged, it is counted towards the
 * visitor's result for that day (attempts, lives, win) — the ranking's source. `day` is today's or
 * a past one from the archive; left out, today. Recording never fails the move: the player's game
 * matters more than the ranking, so a failure is only logged.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params

  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'unknown sport' }, { status: 404 })
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = parseMoveRequest(body)
    const daily = parseDaily(body, parsed)
    const result = await applyMove(supabase, sport, parsed)

    if (daily) {
      const move = { ...daily, playerAId: parsed.playerAId, playerBId: parsed.playerBId }
      await recordDailyMove(supabaseAdmin(), sport, move, result).catch((err) =>
        console.error('daily result not recorded', err),
      )
    }
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}

function parseMoveRequest(body: unknown): MoveRequest {
  if (!body || typeof body !== 'object') throw new ValidationError('body must be an object')
  const raw = body as Record<string, unknown>

  const playerAId = requireString(raw.playerAId, 'playerAId')
  const playerBId = requireString(raw.playerBId, 'playerBId')

  const difficulty = raw.difficulty
  if (difficulty !== 'easy' && difficulty !== 'hard') {
    throw new ValidationError('difficulty must be "easy" or "hard"')
  }

  return {
    playerAId,
    playerBId,
    difficulty,
    graph: parseGraph(raw.graph),
    move: parseMove(raw.move),
  }
}

/** The daily is easy mode only — one set of rules, one ranking. */
function parseDaily(body: unknown, req: MoveRequest): { visitorId: VisitorId; day?: ChallengeDay } | null {
  const daily = (body as Record<string, unknown>).daily
  if (daily === undefined) return null
  const raw = asObject(daily, 'daily')
  if (!isVisitorId(raw.visitorId)) throw new ValidationError('daily.visitorId must be a UUID')
  if (req.difficulty !== 'easy') throw new ValidationError('the daily challenge is played in easy mode')
  if (raw.day === undefined) return { visitorId: raw.visitorId }
  try {
    return { visitorId: raw.visitorId, day: ChallengeDay(String(raw.day)) }
  } catch {
    throw new ValidationError('daily.day must be a YYYY-MM-DD date')
  }
}

function parseGraph(value: unknown): GraphState {
  if (!value || typeof value !== 'object') throw new ValidationError('graph is required')
  const raw = value as Record<string, unknown>

  if (!Array.isArray(raw.players)) throw new ValidationError('graph.players must be an array')
  if (!Array.isArray(raw.clubs)) throw new ValidationError('graph.clubs must be an array')
  if (!Array.isArray(raw.edges)) throw new ValidationError('graph.edges must be an array')

  return {
    players: raw.players.map((p, i) => requireString(p, `graph.players[${i}]`)),
    clubs: raw.clubs.map((c, i) => {
      const club = asObject(c, `graph.clubs[${i}]`)
      return {
        id: requireString(club.id, `graph.clubs[${i}].id`),
        season: requireSeason(club.season, `graph.clubs[${i}].season`),
      }
    }),
    edges: raw.edges.map((e, i) => {
      const edge = asObject(e, `graph.edges[${i}]`)
      return {
        playerId: requireString(edge.playerId, `graph.edges[${i}].playerId`),
        clubId: requireString(edge.clubId, `graph.edges[${i}].clubId`),
        season: requireSeason(edge.season, `graph.edges[${i}].season`),
      }
    }),
  }
}

function parseMove(value: unknown): UserInput {
  const raw = asObject(value, 'move')

  switch (raw.kind) {
    case 'easy':
      return { kind: 'easy', playerId: PlayerId(requireString(raw.playerId, 'move.playerId')) }
    case 'hard-player':
      return { kind: 'hard-player', playerId: PlayerId(requireString(raw.playerId, 'move.playerId')) }
    case 'hard-club':
      return {
        kind: 'hard-club',
        clubId: ClubId(requireString(raw.clubId, 'move.clubId')),
        season: requireSeason(raw.season, 'move.season') as Season,
      }
    default:
      throw new ValidationError('move.kind must be "easy", "hard-player" or "hard-club"')
  }
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new ValidationError(`${field} must be an object`)
  return value as Record<string, unknown>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') throw new ValidationError(`${field} is required`)
  return value
}

function requireSeason(value: unknown, field: string): Season {
  const raw = requireString(value, field)
  if (!isSeason(raw)) throw new ValidationError(`${field} must be a valid season (YYYY-YYYY)`)
  return raw
}
