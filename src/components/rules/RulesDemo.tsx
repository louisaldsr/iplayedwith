'use client'

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { FameFloorKey } from '../../domain/fameFloor'
import { useTranslations } from '../../i18n'
import { Heart } from '../game/LivesBar'

/**
 * A real football chain, from Messi to Ronaldo: Messi and Neymar at Barcelona (2013-2014), Neymar
 * and Cavani at PSG (2017-2018), Cavani and Ronaldo at Manchester United (2021-2022). Neymar never
 * played with Ronaldo, nor Cavani with Messi, so each move links one step further. Haaland shares
 * no club and season with any of them.
 * Football, whatever the page's sport: the names everyone knows make the idea land fastest. But a
 * wrong link here would teach the wrong rule: change a name, check its memberships again.
 *
 * Positions are percentages of the stage; every card is CARD_W × CARD_H.
 */
const CARD_W = 30
const CARD_H = 26

/** `short` names the teammate in a verdict line, which has to fit a phone. */
type DemoCard = { name: string; short: string; x: number; y: number; floor?: FameFloorKey }

const CARDS = {
  a: { name: 'Lionel Messi', short: 'Messi', x: 1, y: 37 },
  b: { name: 'Cristiano Ronaldo', short: 'Ronaldo', x: 69, y: 37 },
  neymar: { name: 'Neymar', short: 'Neymar', x: 22, y: 5, floor: 'famous' },
  haaland: { name: 'Erling Haaland', short: 'Haaland', x: 12, y: 69 },
  cavani: { name: 'Edinson Cavani', short: 'Cavani', x: 48, y: 69, floor: 'famous' },
} satisfies Record<string, DemoCard>

type CardKey = keyof typeof CARDS

/** The chain, from A: its order staggers the cards lighting up on the win, as on the real board. */
const CHAIN: CardKey[] = ['a', 'neymar', 'cavani', 'b']

type Link = { teammate: CardKey; club: string; season: string }

/** One move: the name is typed, then submitted, then judged. */
type Move = { card: CardKey; typeAt: number; submitAt: number; links: Link[] }

// ─── The script, in milliseconds from the start of the loop ─────────────────────────────────────

const TYPE_MS_PER_CHAR = 65
const A_AT = 200
const B_AT = 550

const MOVES: Move[] = [
  {
    card: 'neymar',
    typeAt: 3400,
    submitAt: 4800,
    links: [{ teammate: 'a', club: 'FC Barcelona', season: '2013-2014' }],
  },
  { card: 'haaland', typeAt: 8400, submitAt: 9700, links: [] },
  {
    card: 'cavani',
    typeAt: 12900,
    submitAt: 14300,
    links: [
      { teammate: 'neymar', club: 'PSG', season: '2017-2018' },
      { teammate: 'b', club: 'Manchester United', season: '2021-2022' },
    ],
  },
]

/** A judged move draws a line to each teammate it shares a club and a season with. */
const EDGES = MOVES.flatMap((m) => m.links.map((l) => ({ from: l.teammate, to: m.card, at: m.submitAt })))

const MISS = MOVES[1]
/** The rejected card fades out, then leaves the board. */
const MISS_FADE_AT = 11000
const MISS_GONE_AT = 11400
const WIN_AT = 14800

const SCENES = [
  { key: 'goal', start: 0 },
  { key: 'move', start: 3000 },
  { key: 'miss', start: 8000 },
  { key: 'win', start: 12500 },
] as const
const LOOP_MS = 19000

type SceneKey = (typeof SCENES)[number]['key']

const TICK_MS = 50

/**
 * A looping clock: milliseconds since the start of the loop, ticking while `running`. Pausing
 * keeps the time; `seek` jumps to any point.
 */
function useLoopClock(running: boolean) {
  const [now, setNow] = useState(0)
  // performance.now() at the loop's time 0, and the last time shown — to resume where it paused.
  const origin = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!running) return
    origin.current = performance.now() - last.current
    const id = window.setInterval(() => {
      last.current = (performance.now() - origin.current) % LOOP_MS
      setNow(last.current)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [running])

  const seek = useCallback((t: number) => {
    origin.current = performance.now() - t
    last.current = t
    setNow(t)
  }, [])

  return [now, seek] as const
}

const center = (key: CardKey) => ({ x: CARDS[key].x + CARD_W / 2, y: CARDS[key].y + CARD_H / 2 })

type Props = {
  /** The dialog is open: the demo plays, from the start each time it opens. */
  active: boolean
}

/**
 * How to play, shown instead of told: a mini board plays a short game on a loop — the two players,
 * a good move, a move that costs a life, the winning move. Each scene has its caption; the
 * progress bar under it jumps to a scene, and the loop can be paused.
 *
 * Everything is drawn from the clock, so any point of the loop renders the same, and a scene
 * jumped to looks as if it had been played. The cards use the board's own classes: the demo is
 * what the game looks like.
 */
export function RulesDemo({ active }: Props) {
  const t = useTranslations()
  const [paused, setPaused] = useState(false)
  const [now, seek] = useLoopClock(active && !paused)

  useEffect(() => {
    if (!active) return
    seek(0)
    setPaused(false)
  }, [active, seek])

  const sceneIndex = SCENES.findLastIndex((s) => s.start <= now)
  const scene: SceneKey = SCENES[sceneIndex].key
  const sceneEnd = SCENES[sceneIndex + 1]?.start ?? LOOP_MS
  const sceneProgress = (now - SCENES[sceneIndex].start) / (sceneEnd - SCENES[sceneIndex].start)

  const typing = MOVES.find((m) => now >= m.typeAt && now < m.submitAt)
  const typed = typing ? CARDS[typing.card].name.slice(0, Math.floor((now - typing.typeAt) / TYPE_MS_PER_CHAR)) : ''
  const pressing = typing !== undefined && now >= typing.submitAt - 250
  // The verdict of the last move judged, until the next one starts being typed.
  const judged = [...MOVES].reverse().find((m) => now >= m.submitAt)
  const verdict = judged && !typing ? judged : undefined

  const missed = now >= MISS.submitAt
  const won = now >= WIN_AT

  const visible = (key: CardKey): boolean => {
    if (key === 'a') return now >= A_AT
    if (key === 'b') return now >= B_AT
    if (key === 'haaland') return now >= MISS.submitAt && now < MISS_GONE_AT
    return now >= MOVES.find((m) => m.card === key)!.submitAt
  }

  return (
    <div className="rules-demo">
      <div
        className={won ? 'rules-demo__stage game-board game-board--won' : 'rules-demo__stage game-board'}
        aria-hidden="true"
      >
        <svg className="game-board-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {EDGES.filter((e) => now >= e.at).map(({ from, to }) => {
            const p1 = center(from)
            const p2 = center(to)
            return (
              <line
                key={`${from}:${to}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                vectorEffect="non-scaling-stroke"
                className={won ? 'graph-edge graph-edge--path' : 'graph-edge graph-edge--path rules-demo__edge'}
              />
            )
          })}
        </svg>

        {(Object.keys(CARDS) as CardKey[]).filter(visible).map((key) => {
          const card: DemoCard = CARDS[key]
          const target = key === 'a' || key === 'b'
          const step = CHAIN.indexOf(key)
          const classes = [
            'node-card',
            'node-card--player',
            'rules-demo__card',
            target ? 'node-card--target' : '',
            card.floor ? `node-card--${card.floor}` : '',
            key === 'haaland' ? 'rules-demo__card--miss' : '',
            key === 'haaland' && now >= MISS_FADE_AT ? 'rules-demo__card--gone' : '',
            won && step >= 0 ? 'node-card--highlighted' : '',
          ]
          const style = {
            left: `${card.x}%`,
            top: `${card.y}%`,
            ...(step >= 0 && { '--path-step': step }),
          } as CSSProperties
          return (
            <div key={key} className={classes.filter(Boolean).join(' ')} style={style}>
              {card.floor && <span className="node-card__floor">{t.fame.floors[card.floor]}</span>}
              <img src="/dummy.svg" alt="" className="node-card__avatar" draggable={false} />
              <span className="node-card__label">{card.name}</span>
            </div>
          )
        })}

        <div className="rules-demo__hearts">
          {[0, 1, 2].map((i) => {
            const lost = missed && i === 2
            return (
              <span key={lost ? 'lost' : i} className={`heart${lost ? ' heart--empty heart--breaking' : ''}`}>
                <Heart full={!lost} />
              </span>
            )
          })}
        </div>
      </div>

      <div className="rules-demo__input" aria-hidden="true">
        <span className="rules-demo__field">
          {typing ? (
            <>
              {typed}
              <span className="rules-demo__caret" />
            </>
          ) : (
            <span className="rules-demo__placeholder">{t.game.easyPlaceholder}</span>
          )}
        </span>
        <span className={pressing ? 'rules-demo__submit rules-demo__submit--pressed' : 'rules-demo__submit'}>
          {t.game.submit}
        </span>
      </div>

      <p
        className={`rules-demo__verdict${verdict ? ` rules-demo__verdict--${verdict.links.length > 0 ? 'ok' : 'miss'}` : ''}`}
        aria-hidden="true"
      >
        {verdict &&
          (verdict.links.length > 0
            ? verdict.links.map((l) => (
                <span key={l.teammate}>✓ {t.rules.demo.linked(CARDS[l.teammate].short, l.club, l.season)}</span>
              ))
            : `✕ ${t.game.rejections['not-connected']}`)}
      </p>

      <p className="rules-demo__caption">{t.rules.demo.captions[scene]}</p>

      <div className="rules-demo__controls">
        <button
          type="button"
          className="rules-demo__pause"
          aria-label={paused ? t.rules.demo.play : t.rules.demo.pause}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? '▶' : '❚❚'}
        </button>
        <ol className="rules-demo__steps">
          {SCENES.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                className="rules-demo__step"
                aria-label={`${t.rules.demo.step(i + 1, SCENES.length)} — ${t.rules.demo.captions[s.key]}`}
                aria-current={i === sceneIndex ? 'step' : undefined}
                onClick={() => seek(s.start)}
              >
                <span
                  className="rules-demo__step-fill"
                  style={{ width: `${i < sceneIndex ? 100 : i === sceneIndex ? sceneProgress * 100 : 0}%` }}
                />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
