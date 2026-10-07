'use client'

import { useReducer, useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { Game, DifficultyLevel } from '../game/game'
import { Player } from '../domain/player'
import { Club } from '../domain/club'
import { SportId } from '../domain/sport'
import { DailyChallenge, DAILY_LIVES } from '../domain/dailyChallenge'
import { DailyArchiveResult } from '../domain/dailyArchive'
import { RemoteEngine, RemoteInputResult, createRemoteEngine } from '../game/remoteEngine'
import { UserInput } from '../game/userInput'
import { useTranslations } from '../i18n'
import { SetupScreen } from './setup/SetupScreen'
import { GameScreen } from './game/GameScreen'
import { VictoryDialog } from './victory/VictoryDialog'
import { DailyIntro } from './daily/DailyIntro'
import { DailyFinished } from './daily/DailyFinished'
import { DefeatDialog } from './daily/DefeatDialog'
import { useDailySolution } from './daily/useDailySolution'
import { SolutionOverlay } from './daily/SolutionOverlay'
import { DailyBoard, DailyOutcome, readDailyRecord, saveDailyRecord } from '../lib/dailyProgress'
import { readVisitor } from '../lib/visitor'
import { recordDailyHint, startDailyChallenge } from '../lib/gameApi'
import { dailyShareText } from '../lib/dailyShare'
import { dailyScore } from '../domain/dailyScore'

/**
 * `victory`: the won board stays on screen, results in a pop-up over it.
 * `lost`: a daily's last life spent — the board stays too, results over it, the proposed solution
 * one click away.
 * `finished`: a daily over without a board to show — from before boards were kept.
 */
type Phase = 'setup' | 'playing' | 'victory' | 'lost' | 'finished'

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
  /** When the final move landed — freezes the clock and the time shown in the results. */
  finishedAt: Date | null
  /** The results pop-up over a finished board; closed, the board stays to be looked at. */
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

/**
 * Where a daily stands in this browser, read once on mount — and, for a past day, on the server.
 * Null in free play.
 */
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
  // A past day may have been played elsewhere (another browser, or before this one kept every
  // day): the server's lives and outcome win over a fresh local record — no replaying a lost day.
  const server = mode.archived
  const livesLeft = Math.max(0, Math.min(record.livesLeft, DAILY_LIVES - (server?.livesLost ?? 0)))
  const outcome = record.outcome ?? server?.outcome ?? (livesLeft === 0 ? 'lost' : null)
  // A finished board comes back to be looked at again — a won one only with its chain.
  const board = outcome === 'won' && !record.board?.path?.length ? undefined : record.board
  const engine = board
    ? createRemoteEngine(sport, playerA, playerB, 'easy', {
        resume: { ...board, startedAt: new Date(board.startedAt) },
        daily: dailyOptions(day),
      })
    : null
  return {
    livesLeft,
    outcome,
    engine,
    moveCount: board?.moveCount ?? 0,
    finishedAt: board?.finishedAt ? new Date(board.finishedAt) : null,
  }
}

/** What a daily's engine sends with each move — nothing without a visitor id (no storage): played, not ranked. */
function dailyOptions(day: string): { visitorId: string; day: string } | undefined {
  const visitorId = readVisitor().playerId
  return visitorId ? { visitorId, day } : undefined
}

/**
 * Free play starts on its setup screen. A daily starts where this browser left it today: on the
 * board as it was, with the lives already lost; or on the finished board, won or lost, results
 * closed — leaving and coming back must neither refill lives, replay a lost day, nor lose the board.
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
    phase: outcome === 'won' ? 'victory' : outcome === 'lost' ? 'lost' : 'playing',
    game: { ...engine.game },
    players: [...engine.players],
    clubs: [...engine.clubs],
    moveCount,
  }
}

/** What the daily keeps of its board: the game in progress, or the finished board, won or lost. */
type BoardState = Pick<UIState, 'phase' | 'game' | 'players' | 'clubs' | 'moveCount' | 'finishedAt'>

function boardOf({ phase, game, players, clubs, moveCount, finishedAt }: BoardState): DailyBoard | undefined {
  if ((phase !== 'playing' && phase !== 'victory' && phase !== 'lost') || !game) return undefined
  return {
    nodes: [...game.nodes.values()],
    edges: game.edges,
    players,
    clubs,
    moveCount,
    startedAt: game.startedAt.toISOString(),
    ...(phase !== 'playing' && { finishedAt: (finishedAt ?? new Date()).toISOString() }),
    ...(phase === 'victory' && { path: game.path }),
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
          // The board stays, results over it — without one (never launched here), the finished screen.
          ...(lives === 0 && {
            phase: state.game ? ('lost' as const) : ('finished' as const),
            outcome: 'lost' as const,
            finishedAt: action.at,
            resultsOpen: true,
          }),
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
 * `archived` marks a past day, played from the archive, with the visitor's result on the server
 * (null if never started).
 */
export type GameMode =
  { kind: 'free' } | { kind: 'daily'; challenge: DailyChallenge; archived?: DailyArchiveResult | null }

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
    const dailyMoves = daily ? dailyOptions(daily.day) : undefined
    if (daily && dailyMoves) startDailyChallenge(daily.sport, daily.day, dailyMoves.visitorId)
    engineRef.current = createRemoteEngine(sport, playerA, playerB, difficulty, { daily: dailyMoves })
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

  // The proposed solution, once the day is over here — asked of the server only when wanted.
  const dailyOver = daily !== null && (state.phase === 'victory' || state.phase === 'lost')
  const overDay = useMemo(
    () => (daily && dailyOver ? { sport: daily.sport, day: daily.day } : null),
    [daily, dailyOver],
  )
  const solution = useDailySolution(overDay)
  // From the results pop-up: close it, the board and its solution underneath.
  const showSolution = useCallback(() => {
    dispatch({ type: 'SHOW_RESULTS', open: false })
    void solution.show()
  }, [solution])

  const ended =
    (state.phase === 'victory' || state.phase === 'lost') && state.game
      ? { elapsedMs: (state.finishedAt ?? new Date()).getTime() - state.game.startedAt.getTime() }
      : null
  const victory = state.phase === 'victory' ? ended : null
  const freePlayHref = daily ? `/${sport}/free` : undefined
  const archiveHref = daily ? `/${sport}/archive` : undefined

  // The daily's message to share once it is over — from the board alone, players as squares.
  const shareText =
    daily && ended && state.game && state.lives !== null
      ? dailyShareText(
          {
            sport: daily.sport,
            number: daily.number,
            playerA: daily.playerA,
            playerB: daily.playerB,
            added: state.players.slice(2).map((p) => p.id),
            lives: { left: state.lives, total: DAILY_LIVES },
            ...(state.phase === 'victory'
              ? {
                  outcome: 'won' as const,
                  path: state.game.path,
                  score: dailyScore(state.moveCount, daily.optimalLinks),
                  elapsedMs: ended.elapsedMs,
                }
              : { outcome: 'lost' as const }),
          },
          t,
        )
      : null

  // A finished game keeps its board on screen: the results open over it, and this bar replaces the
  // move input to reopen them. One button only — everything else (share, solution, what to play
  // next) is in the results.
  const endBar = ended && state.game && (
    <div className={`won-bar${state.phase === 'lost' ? ' won-bar--lost' : ''}`}>
      <button
        type="button"
        className="btn btn--primary btn--lg won-bar__results"
        onClick={() => dispatch({ type: 'SHOW_RESULTS', open: true })}
      >
        {t.victory.results}
      </button>
    </div>
  )

  return (
    <div className="game-page">
      {state.phase === 'setup' && daily && (
        <DailyIntro
          challenge={daily}
          archived={mode.kind === 'daily' && mode.archived !== undefined}
          onStart={handleStart}
        />
      )}

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

      {(state.phase === 'playing' || state.phase === 'victory' || state.phase === 'lost') && state.game && (
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
          over={ended ? { elapsedMs: ended.elapsedMs, bar: endBar } : undefined}
          solution={solution.shown ?? undefined}
          boardOverlay={dailyOver ? <SolutionOverlay solution={solution} /> : undefined}
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
          daily={daily ? { sport: daily.sport, day: daily.day } : undefined}
          onShowSolution={daily ? showSolution : undefined}
          shareText={shareText ?? undefined}
          onPlayAgain={daily ? undefined : handlePlayAgain}
          freePlayHref={freePlayHref}
          archiveHref={archiveHref}
        />
      )}

      {state.phase === 'lost' && daily && (
        <DefeatDialog
          open={state.resultsOpen}
          onClose={closeResults}
          challenge={daily}
          onShowSolution={showSolution}
          shareText={shareText ?? undefined}
        />
      )}
    </div>
  )
}
