import { SportId, SPORTS } from '@/domain/sport'
import { ChallengeDay, challengeDayOf, DAILY_LIVES } from '@/domain/dailyChallenge'
import { Player } from '@/domain/player'
import { Club } from '@/domain/club'
import { PlayerId } from '@/domain/ids'
import { GameNode } from '@/graph/node'
import { GameEdge } from '@/graph/edge'

/**
 * This browser's progress on each sport's daily challenge — browser-side only, like `visitor.ts`.
 *
 * Per sport and day: lives left and, once over, whether it was won or lost; the board itself while
 * it is played, and once over. `ipw.daily.<sport>` holds the latest day played there — what the
 * menu reads to colour the sport today; an older day, played from the archive or pushed out by a
 * newer one, lives in `ipw.daily.<sport>.<day>`. A day with no record reads as a fresh start.
 *
 * It is what makes lives stick: without it a reload would refill them, and a lost day could be
 * replayed at once — and leaving the page mid-game resumes the same board. It is NOT tamper-proof — clearing site data resets it. Real enforcement needs
 * results stored on the server, which comes with accounts and the ranking.
 *
 * Storage failures are swallowed: a game must never break because the browser blocks storage.
 */

export type DailyOutcome = 'won' | 'lost'

/**
 * A daily's board, as the client holds it — enough to rebuild the engine on return: the game in
 * progress, or the winning board to look at again.
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
  /** Won boards only: the winning chain, A to B. */
  path?: PlayerId[]
  /** Finished boards, won or lost: when the final move landed. */
  finishedAt?: string
}

export type DailyRecord = {
  livesLeft: number
  /** Set once the day is over; absent while it can still be played. */
  outcome?: DailyOutcome
  /** Set from the first "Start"; kept once the day is over, won or lost. */
  board?: DailyBoard
}

type StoredRecord = DailyRecord & { day: string }

/** The latest day played in the sport. */
const latestKeyOf = (sport: SportId) => `ipw.daily.${sport}`
/** Any other day. */
const dayKeyOf = (sport: SportId, day: string) => `ipw.daily.${sport}.${day}`

const fresh = (): DailyRecord => ({ livesLeft: DAILY_LIVES })

function readStored(key: string): StoredRecord | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRecord>
    if (typeof parsed.day !== 'string' || typeof parsed.livesLeft !== 'number') return null
    const livesLeft = Math.max(0, Math.min(DAILY_LIVES, Math.floor(parsed.livesLeft)))
    const outcome = parsed.outcome === 'won' || parsed.outcome === 'lost' ? parsed.outcome : undefined
    const board = isBoard(parsed.board) ? parsed.board : undefined
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

const isDate = (v: unknown): v is string => isString(v) && !Number.isNaN(Date.parse(v))

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
    isDate(v.startedAt) &&
    (v.path === undefined || (Array.isArray(v.path) && v.path.every(isString))) &&
    (v.finishedAt === undefined || isDate(v.finishedAt))
  )
}

function readStoredDay(sport: SportId, day: ChallengeDay): StoredRecord | null {
  const latest = readStored(latestKeyOf(sport))
  if (latest?.day === day) return latest
  const stored = readStored(dayKeyOf(sport, day))
  return stored?.day === day ? stored : null
}

/** Where this browser stands on the sport's challenge for `day` — a fresh start if never played. */
export function readDailyRecord(sport: SportId, day: ChallengeDay): DailyRecord {
  const stored = readStoredDay(sport, day)
  if (!stored) return fresh()
  return { livesLeft: stored.livesLeft, outcome: stored.outcome, board: stored.board }
}

/**
 * Saves the day's record: as the latest day when it is (or is newer than the latest, which moves
 * to a key of its own — its lives and board stay); under its own key when it is an older day.
 */
export function saveDailyRecord(sport: SportId, day: ChallengeDay, record: DailyRecord): void {
  try {
    const value = JSON.stringify({ day, ...record })
    const latest = readStored(latestKeyOf(sport))
    if (latest && latest.day > day) {
      window.localStorage.setItem(dayKeyOf(sport, day), value)
      return
    }
    if (latest && latest.day < day) {
      window.localStorage.setItem(dayKeyOf(sport, latest.day), JSON.stringify(latest))
    }
    window.localStorage.setItem(latestKeyOf(sport), value)
    window.localStorage.removeItem(dayKeyOf(sport, day))
  } catch {
    // Lives will not survive a reload; the game itself still works.
  }
}

/** How each sport's challenge of the current day ended in this browser; unfinished ones are absent. */
export function dailyOutcomesToday(now: Date = new Date()): Map<SportId, DailyOutcome> {
  const today = challengeDayOf(now)
  const outcomes = new Map<SportId, DailyOutcome>()
  for (const sport of SPORTS) {
    const stored = readStored(latestKeyOf(sport))
    if (stored?.day === today && stored.outcome) outcomes.set(sport, stored.outcome)
  }
  return outcomes
}
