import { SportId, SPORTS } from '@/domain/sport'
import { ChallengeDay, challengeDayOf, DAILY_LIVES } from '@/domain/dailyChallenge'
import { Player } from '@/domain/player'
import { Club } from '@/domain/club'
import { GameNode } from '@/graph/node'
import { GameEdge } from '@/graph/edge'

/**
 * This browser's progress on each sport's daily challenge — browser-side only, like `visitor.ts`.
 *
 * One key per sport, `ipw.daily.<sport>`, holding the latest day played there: lives left and,
 * once over, whether it was won or lost; while it is being played, the board itself. Only the latest day matters — a record for another day
 * reads as a fresh start, so yesterday's goes stale by itself at midnight (Paris).
 *
 * It is what makes lives stick: without it a reload would refill them, and a lost day could be
 * replayed at once — and leaving the page mid-game resumes the same board. It is NOT tamper-proof — clearing site data resets it. Real enforcement needs
 * results stored on the server, which comes with accounts and the ranking.
 *
 * Storage failures are swallowed: a game must never break because the browser blocks storage.
 */

export type DailyOutcome = 'won' | 'lost'

/**
 * A daily game in progress, as the client holds it — enough to rebuild the engine on return.
 *
 * Trusting it is safe: the server revalidates every edge the client sends with its next move, so a
 * board edited in devtools is rejected there, like any forged graph.
 */
export type DailyBoard = {
  nodes: GameNode[]
  edges: GameEdge[]
  players: Player[]
  clubs: Club[]
  moveCount: number
  /** ISO timestamp of the first launch today — the victory time counts from there. */
  startedAt: string
}

export type DailyRecord = {
  livesLeft: number
  /** Set once the day is over; absent while it can still be played. */
  outcome?: DailyOutcome
  /** Set once the day is launched and until it ends; absent before the first "Start". */
  board?: DailyBoard
}

type StoredRecord = DailyRecord & { day: string }

const keyOf = (sport: SportId) => `ipw.daily.${sport}`

const fresh = (): DailyRecord => ({ livesLeft: DAILY_LIVES })

function readStored(sport: SportId): StoredRecord | null {
  try {
    const raw = window.localStorage.getItem(keyOf(sport))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRecord>
    if (typeof parsed.day !== 'string' || typeof parsed.livesLeft !== 'number') return null
    const livesLeft = Math.max(0, Math.min(DAILY_LIVES, Math.floor(parsed.livesLeft)))
    const outcome = parsed.outcome === 'won' || parsed.outcome === 'lost' ? parsed.outcome : undefined
    const board = !outcome && isBoard(parsed.board) ? parsed.board : undefined
    return { day: parsed.day, livesLeft, outcome, board }
  } catch {
    return null
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isString = (v: unknown): v is string => typeof v === 'string'

function isNode(v: unknown): v is GameNode {
  if (!isObject(v) || !isString(v.id)) return false
  return v.kind === 'player' || (v.kind === 'club' && isString(v.season))
}

const isEdge = (v: unknown): v is GameEdge =>
  isObject(v) && isString(v.playerId) && isString(v.clubId) && isString(v.season)

const isEntity = (v: unknown): v is { id: string; name: string } => isObject(v) && isString(v.id) && isString(v.name)

/** Shape only: a malformed board is dropped (the day restarts from A and B), never trusted half-way. */
function isBoard(v: unknown): v is DailyBoard {
  return (
    isObject(v) &&
    Array.isArray(v.nodes) &&
    v.nodes.every(isNode) &&
    Array.isArray(v.edges) &&
    v.edges.every(isEdge) &&
    Array.isArray(v.players) &&
    v.players.every(isEntity) &&
    Array.isArray(v.clubs) &&
    v.clubs.every(isEntity) &&
    typeof v.moveCount === 'number' &&
    isString(v.startedAt) &&
    !Number.isNaN(Date.parse(v.startedAt))
  )
}

/** Where this browser stands on the sport's challenge for `day` — a fresh start if never played. */
export function readDailyRecord(sport: SportId, day: ChallengeDay): DailyRecord {
  const stored = readStored(sport)
  if (!stored || stored.day !== day) return fresh()
  return { livesLeft: stored.livesLeft, outcome: stored.outcome, board: stored.board }
}

export function saveDailyRecord(sport: SportId, day: ChallengeDay, record: DailyRecord): void {
  try {
    window.localStorage.setItem(keyOf(sport), JSON.stringify({ day, ...record }))
  } catch {
    // Lives will not survive a reload; the game itself still works.
  }
}

/** How each sport's challenge of the current day ended in this browser; unfinished ones are absent. */
export function dailyOutcomesToday(now: Date = new Date()): Map<SportId, DailyOutcome> {
  const today = challengeDayOf(now)
  const outcomes = new Map<SportId, DailyOutcome>()
  for (const sport of SPORTS) {
    const stored = readStored(sport)
    if (stored?.day === today && stored.outcome) outcomes.set(sport, stored.outcome)
  }
  return outcomes
}
