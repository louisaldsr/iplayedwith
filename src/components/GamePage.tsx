'use client'

import Link from 'next/link'
import { useReducer, useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { Game, DifficultyLevel } from '../game/game'
import { Player } from '../domain/player'
import { Club } from '../domain/club'
import { SportId } from '../domain/sport'
import { DailyChallenge, DAILY_LIVES } from '../domain/dailyChallenge'
import { RemoteEngine, RemoteInputResult, createRemoteEngine } from '../game/remoteEngine'
import { UserInput } from '../game/userInput'
import { useTranslations } from '../i18n'
import { SetupScreen } from './setup/SetupScreen'
import { GameScreen } from './game/GameScreen'
import { VictoryDialog } from './victory/VictoryDialog'
import { DailyIntro } from './daily/DailyIntro'
import { DailyFinished } from './daily/DailyFinished'
import { DailyBoard, DailyOutcome, readDailyRecord, saveDailyRecord } from '../lib/dailyProgress'
import { readVisitor } from '../lib/visitor'
import { recordDailyHint, startDailyChallenge } from '../lib/gameApi'

/**
 * `victory`: the won board stays on screen, results in a pop-up over it.
 * `finished`: a daily over without a board to show — lost, or won before boards were kept.
 */
type Phase = 'setup' | 'playing' | 'victory' | 'finished'

type UIState = {
  phase: Phase
  difficulty: DifficultyLevel
  playerA: Player | null
  playerB: Player | null
  game: Game | null
  /** The players and clubs currently on the board — grown one move at a time by the server. */
  players: Player[]
  clubs: Club[]
  submitting: boolean
  moveCount: number
  lastError: string | null
  /** Daily only: lives left. Null in free play, which has none. */
  lives: number | null
  /** Bumped on every life lost — the key that replays the red flash. */
  lifeLostCount: number
  /** Bumped on every move the server refused — resets the input for the next guess. */
  rejectedCount: number
  /** How a finished daily ended. */
  outcome: DailyOutcome | null
  /** When the winning move landed — freezes the clock and the time shown in the results. */
  finishedAt: Date | null
  /** The results pop-up over a won board; closed, the board stays to be looked at. */
  resultsOpen: boolean
}

type Action =
  | { type: 'SET_PLAYER_A'; player: Player | null }
  | { type: 'SET_PLAYER_B'; player: Player | null }
  | { type: 'SET_DIFFICULTY'; difficulty: DifficultyLevel }
  | { type: 'START_GAME'; game: Game; players: Player[] }
  | { type: 'SUBMIT_PENDING' }
  | { type: 'SUBMIT_INPUT'; result: RemoteInputResult; message: string; at: Date }
  | { type: 'DISMISS_ERROR' }
  | { type: 'SHOW_RESULTS'; open: boolean }
  | { type: 'PLAY_AGAIN' }

/** Where a daily stands in this browser today, read once on mount. Null in free play. */
type DailyStart = {
  livesLeft: number
  outcome: DailyOutcome | null
  /** The engine rebuilt from the saved board: a day launched and still going, or won. */
  engine: RemoteEngine | null
  moveCount: number
  finishedAt: Date | null
}

function readDailyStart(mode: GameMode): DailyStart | null {
  if (mode.kind !== 'daily') return null
  const { sport, day, playerA, playerB } = mode.challenge
  const record = readDailyRecord(sport, day)
  const outcome = record.outcome ?? (record.livesLeft === 0 ? 'lost' : null)
  // A won board comes back to be looked at again; a lost day only has its result screen.
  const board = outcome === 'lost' || (outcome === 'won' && !record.board?.path?.length) ? undefined : record.board
  const engine = board
    ? createRemoteEngine(sport, playerA, playerB, 'easy', {
        resume: { ...board, startedAt: new Date(board.startedAt) },
        dailyVisitorId: readVisitor().playerId,
      })
    : null
  return {
    livesLeft: record.livesLeft,
    outcome,
    engine,
    moveCount: board?.moveCount ?? 0,
    finishedAt: board?.finishedAt ? new Date(board.finishedAt) : null,
  }
}

/**
 * Free play starts on its setup screen. A daily starts where this browser left it today: on the
 * board as it was, with the lives already lost; on the winning board, results closed; or on the
 * finished screen of a lost day — leaving and coming back must neither refill lives, replay a lost
 * day, nor lose the board.
 */
function initState(start: DailyStart | null): UIState {
  const base = freshState()
  if (!start) return base

  const { livesLeft: lives, outcome, engine, moveCount, finishedAt } = start
  if (!engine) return outcome ? { ...base, lives, outcome, phase: 'finished' } : { ...base, lives }
  return {
    ...base,
    lives,
    outcome,
    finishedAt,
    phase: outcome === 'won' ? 'victory' : 'playing',
    game: { ...engine.game },
    players: [...engine.players],
    clubs: [...engine.clubs],
    moveCount,
  }
}

/** What the daily keeps of its board: the game in progress, or the winning board. */
type BoardState = Pick<UIState, 'phase' | 'game' | 'players' | 'clubs' | 'moveCount' | 'finishedAt'>

function boardOf({ phase, game, players, clubs, moveCount, finishedAt }: BoardState): DailyBoard | undefined {
  if ((phase !== 'playing' && phase !== 'victory') || !game) return undefined
  return {
    nodes: [...game.nodes.values()],
    edges: game.edges,
    players,
    clubs,
    moveCount,
    startedAt: game.startedAt.toISOString(),
    ...(phase === 'victory' && { path: game.path, finishedAt: (finishedAt ?? new Date()).toISOString() }),
  }
}

function freshState(): UIState {
  return {
    phase: 'setup',
    difficulty: 'easy',
    playerA: null,
    playerB: null,
    game: null,
    players: [],
    clubs: [],
    submitting: false,
    moveCount: 0,
    lastError: null,
    lives: null,
    lifeLostCount: 0,
    rejectedCount: 0,
    outcome: null,
    finishedAt: null,
    resultsOpen: false,
  }
}

function reducer(state: UIState, action: Action): UIState {
  switch (action.type) {
    case 'SET_PLAYER_A':
      return { ...state, playerA: action.player }

    case 'SET_PLAYER_B':
      return { ...state, playerB: action.player }

    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.difficulty }

    case 'START_GAME':
      return {
        ...state,
        phase: 'playing',
        game: action.game,
        players: action.players,
        clubs: [],
        moveCount: 0,
        lastError: null,
      }

    case 'SUBMIT_PENDING':
      return { ...state, submitting: true }

    case 'SUBMIT_INPUT': {
      if (!action.result.ok) {
        // A move the server judged clears the input for the next guess; after a transport error
        // it stays, so the same move can simply be retried.
        const rejectedCount = state.rejectedCount + (action.result.code ? 1 : 0)

        // Only a guess judged wrong costs a life — never an error, a duplicate or a game over.
        const costsLife = state.lives !== null && action.result.code === 'not-connected'
        if (!costsLife) return { ...state, submitting: false, lastError: action.message, rejectedCount }

        const lives = Math.max(0, state.lives! - 1)
        return {
          ...state,
          submitting: false,
          lastError: lives > 0 ? action.message : null,
          lives,
          lifeLostCount: state.lifeLostCount + 1,
          rejectedCount,
          ...(lives === 0 && { phase: 'finished' as const, outcome: 'lost' as const }),
        }
      }
      const game = { ...action.result.game }
      const isVictory = game.path.length > 0
      return {
        ...state,
        game,
        players: action.result.players,
        clubs: action.result.clubs,
        submitting: false,
        moveCount: state.moveCount + 1,
        lastError: null,
        phase: isVictory ? 'victory' : 'playing',
        outcome: isVictory && state.lives !== null ? 'won' : state.outcome,
        finishedAt: isVictory ? action.at : null,
        resultsOpen: isVictory,
      }
    }

    case 'DISMISS_ERROR':
      return { ...state, lastError: null }

    case 'SHOW_RESULTS':
      return { ...state, resultsOpen: action.open }

    case 'PLAY_AGAIN':
      return freshState()

    default:
      return state
  }
}

/**
 * Free play: the user picks the pair and the difficulty.
 * Daily: the pair is the day's challenge, always in easy mode — one set of rules for everyone.
 */
export type GameMode = { kind: 'free' } | { kind: 'daily'; challenge: DailyChallenge }

const FREE_PLAY: GameMode = { kind: 'free' }

type Props = {
  sport: SportId
  mode?: GameMode
}

/**
 * The game shell.
 *
 * Nothing is fetched on mount: the setup screen paints immediately and every lookup
 * (player search, randomize, the direct-connection check, each move) is a bounded request
 * made on demand. The graph and its rules live on the server — see `remoteEngine`.
 */
export function GamePage({ sport, mode = FREE_PLAY }: Props) {
  const t = useTranslations()
  const [dailyStart] = useState(() => readDailyStart(mode))
  const [state, dispatch] = useReducer(reducer, dailyStart, initState)
  const engineRef = useRef<RemoteEngine | null>(dailyStart?.engine ?? null)

  const daily = mode.kind === 'daily' ? mode.challenge : null

  // The day's progress is saved on every change, so leaving and coming back resumes it: the board
  // from the first "Start", the lives left, and how it ended — which the menu also reads to colour
  // the sport.
  const { phase, game, players, clubs, moveCount, finishedAt } = state
  const board = useMemo(
    () => (daily ? boardOf({ phase, game, players, clubs, moveCount, finishedAt }) : undefined),
    [daily, phase, game, players, clubs, moveCount, finishedAt],
  )
  useEffect(() => {
    if (!daily || state.lives === null) return
    saveDailyRecord(daily.sport, daily.day, { livesLeft: state.lives, outcome: state.outcome ?? undefined, board })
  }, [daily, state.lives, state.outcome, board])

  const handleStart = useCallback(() => {
    const playerA = daily ? daily.playerA : state.playerA
    const playerB = daily ? daily.playerB : state.playerB
    const difficulty = daily ? 'easy' : state.difficulty
    if (!playerA || !playerB) return

    // The daily's result is kept by the server, under this browser's anonymous id: Start stamps
    // the time, each move is counted. Without storage there is no id — the game is played, not
    // ranked.
    const visitorId = daily ? readVisitor().playerId : ''
    if (daily && visitorId) startDailyChallenge(daily.sport, daily.day, visitorId)
    engineRef.current = createRemoteEngine(sport, playerA, playerB, difficulty, {
      dailyVisitorId: visitorId || undefined,
    })
    dispatch({
      type: 'START_GAME',
      game: engineRef.current.game,
      players: [playerA, playerB],
    })
  }, [sport, daily, state.playerA, state.playerB, state.difficulty])

  const handleSubmit = useCallback(
    async (input: UserInput) => {
      const engine = engineRef.current
      if (!engine) return
      dispatch({ type: 'SUBMIT_PENDING' })
      const result = await engine.addInput(input)
      // Shown in the player's language: the server's reason is French, its code is not.
      const message = result.ok ? '' : result.code ? t.game.rejections[result.code] : t.game.moveFailed
      dispatch({ type: 'SUBMIT_INPUT', result, message, at: new Date() })
    },
    [t],
  )

  const handlePlayAgain = useCallback(() => {
    engineRef.current = null
    dispatch({ type: 'PLAY_AGAIN' })
  }, [])

  // A career opened mid-daily is a hint, recorded for a future score — except A's and B's, which
  // everyone needs, and any opened once the game is over.
  const handleCareerOpened = useCallback(
    (player: Player) => {
      if (!daily || state.phase !== 'playing') return
      if (player.id === daily.playerA.id || player.id === daily.playerB.id) return
      const visitorId = readVisitor().playerId
      if (visitorId) recordDailyHint(daily.sport, daily.day, visitorId, player.id)
    },
    [daily, state.phase],
  )

  const closeResults = useCallback(() => dispatch({ type: 'SHOW_RESULTS', open: false }), [])

  // A won game keeps its board on screen: the results open over it, and this bar replaces the
  // move input to reopen them or move on.
  const victory =
    state.phase === 'victory' && state.game
      ? { elapsedMs: (state.finishedAt ?? new Date()).getTime() - state.game.startedAt.getTime() }
      : null
  const freePlayHref = daily ? `/${sport}/free` : undefined
  const wonBar = victory && state.game && (
    <div className="won-bar">
      <span className="won-bar__title">
        <span aria-hidden="true">🏆 </span>
        {t.victory.chainComplete(state.game.path.length - 1)}
      </span>
      <div className="won-bar__actions">
        <button type="button" className="btn btn--ghost" onClick={() => dispatch({ type: 'SHOW_RESULTS', open: true })}>
          {t.victory.results}
        </button>
        {daily ? (
          <Link href={freePlayHref!} className="btn btn--primary">
            {t.daily.freePlay}
          </Link>
        ) : (
          <button type="button" className="btn btn--primary" onClick={handlePlayAgain}>
            {t.victory.playAgain}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="game-page">
      {state.phase === 'setup' && daily && <DailyIntro challenge={daily} onStart={handleStart} />}

      {state.phase === 'setup' && !daily && (
        <SetupScreen
          sport={sport}
          playerA={state.playerA}
          playerB={state.playerB}
          difficulty={state.difficulty}
          onSetPlayerA={(p) => dispatch({ type: 'SET_PLAYER_A', player: p })}
          onSetPlayerB={(p) => dispatch({ type: 'SET_PLAYER_B', player: p })}
          onDifficultyChange={(d) => dispatch({ type: 'SET_DIFFICULTY', difficulty: d })}
          onStart={handleStart}
        />
      )}

      {(state.phase === 'playing' || state.phase === 'victory') && state.game && (
        <GameScreen
          game={state.game}
          sport={sport}
          players={state.players}
          clubs={state.clubs}
          submitting={state.submitting}
          onSubmit={handleSubmit}
          lastError={state.lastError}
          onDismissError={() => dispatch({ type: 'DISMISS_ERROR' })}
          lives={
            state.lives === null ? undefined : { left: state.lives, total: DAILY_LIVES, lostCount: state.lifeLostCount }
          }
          inputResetKey={state.rejectedCount}
          victory={victory ? { elapsedMs: victory.elapsedMs, bar: wonBar } : undefined}
          onCareerOpened={handleCareerOpened}
        />
      )}

      {state.phase === 'finished' && daily && state.outcome && (
        <DailyFinished challenge={daily} outcome={state.outcome} livesLeft={state.lives ?? 0} />
      )}

      {/* Outside the game screen, so the flash of the last life still plays over the game-over one. */}
      {state.lifeLostCount > 0 && <div key={state.lifeLostCount} className="life-flash" aria-hidden="true" />}

      {victory && state.game && (
        <VictoryDialog
          open={state.resultsOpen}
          onClose={closeResults}
          game={state.game}
          players={state.players}
          moveCount={state.moveCount}
          elapsedMs={victory.elapsedMs}
          optimalLinks={daily?.optimalLinks}
          lives={state.lives === null ? undefined : { left: state.lives, total: DAILY_LIVES }}
          statsSport={daily?.sport}
          onPlayAgain={daily ? undefined : handlePlayAgain}
          freePlayHref={freePlayHref}
        />
      )}
    </div>
  )
}
