import { useEffect, useMemo, useRef, useState } from 'react'
import { Game } from '../../game/game'
import { Club } from '../../domain/club'
import { Player } from '../../domain/player'
import { PlayerId, ClubId } from '../../domain/ids'
import { Season } from '../../domain/season'
import { nationalTeamFor } from '../../domain/nationalTeam'
import { DailySolution } from '../../domain/dailySolution'
import { GameNode } from '../../graph/node'
import { playerKey, clubKey } from '../../game/graphBuilder'
import { NodeCard } from './NodeCard'
import {
  Point,
  Size,
  cardSizeFor,
  centreOf,
  fromFraction,
  isCompact,
  placeCard,
  settleCard,
  targetSpots,
  toFraction,
} from './boardLayout'
import { ClubLogo } from '../shared/ClubLogo'

/** A press that moves less than this is a click (open the career), not a drag. */
const CLICK_TOLERANCE = 5
/** Measured once mounted; jsdom measures nothing. */
const FALLBACK_SIZE: Size = { w: 800, h: 500 }

type DragState = {
  key: string
  startX: number
  startY: number
  originX: number
  originY: number
}

type PlayerPairEdge = {
  key: string
  playerAId: PlayerId
  playerBId: PlayerId
  connections: { clubId: ClubId; season: Season }[]
}

type Props = {
  game: Game
  players: Player[]
  clubs: Club[]
  /** A player card was clicked, not dragged — the board opens their career. */
  onOpenPlayer?: (player: Player) => void
  /**
   * Daily, once over: the proposed solution, laid over the visitor's own cards — its players the
   * visitor never added appear as "proposed" cards, its links dashed. Easy mode only.
   */
  solution?: DailySolution
}

/**
 * Where a proposed solution player belongs: on the chain, between the nearest of its neighbours
 * already placed — so the solution reads as one line, A to B. Null when no neighbour is placed.
 */
function chainSpot(path: PlayerId[], i: number, placed: Map<string, Point>, card: Size): Point | null {
  const centreAt = (j: number) => {
    const p = placed.get(playerKey(path[j]))
    return p && centreOf(p, card)
  }
  let before = -1
  for (let j = i - 1; j >= 0 && before < 0; j--) if (centreAt(j)) before = j
  let after = -1
  for (let j = i + 1; j < path.length && after < 0; j++) if (centreAt(j)) after = j
  if (before < 0 && after < 0) return null
  if (before < 0 || after < 0) return centreAt(before < 0 ? after : before)!
  const t = (i - before) / (after - before)
  const a = centreAt(before)!
  const b = centreAt(after)!
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function computePlayerPairEdges(edges: { playerId: PlayerId; clubId: ClubId; season: Season }[]): PlayerPairEdge[] {
  const grouped = new Map<string, { clubId: ClubId; season: Season; players: PlayerId[] }>()
  for (const e of edges) {
    const csKey = `${e.clubId}:${e.season}`
    if (!grouped.has(csKey)) grouped.set(csKey, { clubId: e.clubId, season: e.season, players: [] })
    const g = grouped.get(csKey)!
    if (!g.players.includes(e.playerId)) g.players.push(e.playerId)
  }

  const pairMap = new Map<string, PlayerPairEdge>()
  for (const { clubId, season, players } of grouped.values()) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const sorted = [players[i], players[j]].sort() as [PlayerId, PlayerId]
        const pairKey = `${sorted[0]}:${sorted[1]}`
        if (!pairMap.has(pairKey)) {
          pairMap.set(pairKey, { key: pairKey, playerAId: sorted[0], playerBId: sorted[1], connections: [] })
        }
        pairMap.get(pairKey)!.connections.push({ clubId, season })
      }
    }
  }
  return [...pairMap.values()]
}

export function GameBoard({ game, players, clubs, onOpenPlayer, solution }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)
  /** Each card's place as a share of the board (see `toFraction`): a resize carries the cards along. */
  const [fractions, setFractions] = useState<Map<string, Point>>(new Map())
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<PlayerPairEdge | null>(null)

  useEffect(() => {
    setSelectedEdge(null)
  }, [game.edges.length])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth || FALLBACK_SIZE.w
      const h = el.clientHeight || FALLBACK_SIZE.h
      setSize((prev) => (prev?.w === w && prev?.h === h ? prev : { w, h }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const board = size ?? FALLBACK_SIZE
  const card = cardSizeFor(board)

  // The board's cards: the visitor's, then the proposed solution's players it does not have yet.
  const nodes = useMemo(() => {
    const all = new Map<string, GameNode>(game.nodes)
    for (const id of solution?.path ?? []) {
      if (!all.has(playerKey(id))) all.set(playerKey(id), { kind: 'player', id })
    }
    return all
  }, [game, solution])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playerPairEdges = useMemo(() => computePlayerPairEdges(game.edges), [game.edges.length])

  // The proposed solution's links, and those of the visitor's that it shares.
  const solutionPairEdges = useMemo(() => (solution ? computePlayerPairEdges(solution.edges) : []), [solution])

  /** Every line drawn on the board, by the node keys at its ends — what a new card keeps clear of. */
  const links = useMemo<[string, string][]>(
    () =>
      game.difficulty === 'easy'
        ? [...playerPairEdges, ...solutionPairEdges].map((e) => [playerKey(e.playerAId), playerKey(e.playerBId)])
        : game.edges.map((e) => [playerKey(e.playerId), clubKey(e.clubId, e.season)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.difficulty, game.edges.length, playerPairEdges, solutionPairEdges],
  )

  useEffect(() => {
    if (!size) return
    const aKey = playerKey(game.playerA.id)
    const bKey = playerKey(game.playerB.id)
    const rank = (k: string) => (k === aKey ? 0 : k === bKey ? 1 : 2)

    setFractions((prev) => {
      const newKeys = [...nodes.keys()].filter((k) => !prev.has(k))
      if (newKeys.length === 0) return prev

      const placed = new Map([...prev].map(([k, f]) => [k, fromFraction(f, size, card)]))
      const state = { board: size, card, placed, links, aKey, bKey }
      const ends = targetSpots(size, card)
      const next = new Map(prev)

      // A and B first: every other card is placed relative to them.
      for (const key of [...newKeys].sort((a, b) => rank(a) - rank(b))) {
        let spot: Point
        if (key === aKey) spot = ends.a
        else if (key === bKey) spot = ends.b
        else {
          // A proposed solution player aims for the chain; any other card, for its links.
          const node = nodes.get(key)
          const onChain = node?.kind === 'player' && !game.nodes.has(key) ? (solution?.path.indexOf(node.id) ?? -1) : -1
          const aim = onChain >= 0 ? chainSpot(solution!.path, onChain, placed, card) : null
          spot = placeCard(key, state, aim ?? undefined)
        }
        placed.set(key, spot)
        next.set(key, toFraction(spot, size, card))
      }

      return next
    })
  }, [game, nodes, links, solution, size, card])

  const positions = useMemo(
    () => new Map([...fractions].map(([k, f]) => [k, fromFraction(f, board, card)])),
    [fractions, board, card],
  )

  const handlePointerDown = (e: React.PointerEvent, key: string) => {
    e.preventDefault()
    const pos = positions.get(key)
    if (!pos) return
    setDragging({ key, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y })
    boardRef.current?.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const nx = Math.max(0, Math.min(dragging.originX + (e.clientX - dragging.startX), board.w - card.w))
    const ny = Math.max(0, Math.min(dragging.originY + (e.clientY - dragging.startY), board.h - card.h))
    setFractions((prev) => new Map(prev).set(dragging.key, toFraction({ x: nx, y: ny }, board, card)))
  }

  // Dropped on another card, a card moves to the nearest free spot.
  const handlePointerCancel = () => {
    if (!dragging) return
    const at = positions.get(dragging.key)
    if (at) {
      const aKey = playerKey(game.playerA.id)
      const bKey = playerKey(game.playerB.id)
      const spot = settleCard(dragging.key, at, { board, card, placed: positions, links, aKey, bKey })
      if (spot !== at) setFractions((prev) => new Map(prev).set(dragging.key, toFraction(spot, board, card)))
    }
    setDragging(null)
  }

  // Cards are dragged with the pointer captured by the board, so no click event reaches them: a
  // press released where it started is the click.
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging) return
    const moved = Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY)
    if (moved < CLICK_TOLERANCE) openCareer(dragging.key)
    handlePointerCancel()
  }

  const openCareer = (key: string) => {
    const node = nodes.get(key)
    const player = node?.kind === 'player' ? playerById.get(node.id) : undefined
    if (player && onOpenPlayer) onOpenPlayer(player)
  }

  const allPlayers = [...players, ...(solution?.players ?? [])]
  const allClubs = [...clubs, ...(solution?.clubs ?? [])]
  const playerMap = new Map(allPlayers.map((p) => [p.id as string, p.name]))
  const playerById = new Map(allPlayers.map((p) => [p.id as string, p]))
  const clubById = new Map(allClubs.map((c) => [c.id as string, c]))
  const clubMap = new Map(allClubs.map((c) => [c.id as string, c.name]))
  const isTarget = (id: string) => id === game.playerA.id || id === game.playerB.id

  const center = (key: string): Point | null => {
    const p = positions.get(key)
    return p ? centreOf(p, card) : null
  }

  /** The card size is the layout's: the CSS reads it rather than repeating it. */
  const boardStyle = { '--node-width': `${card.w}px`, '--node-height': `${card.h}px` } as React.CSSProperties

  // ── Easy mode ──────────────────────────────────────────────────────────────

  const pathPairKeys = useMemo(() => {
    const set = new Set<string>()
    for (let i = 0; i < game.path.length - 1; i++) {
      const sorted = [game.path[i], game.path[i + 1]].sort()
      set.add(`${sorted[0]}:${sorted[1]}`)
    }
    return set
  }, [game.path])

  const solutionPairKeys = useMemo(() => new Set(solutionPairEdges.map((e) => e.key)), [solutionPairEdges])
  const solutionOnly = solutionPairEdges.filter((e) => !playerPairEdges.some((own) => own.key === e.key))
  const onSolution = (id: PlayerId) => solution?.path.includes(id) ?? false

  // A path only exists once A and B are connected: the board is then a won board, its chain lit up.
  const boardClass = [
    'game-board',
    isCompact(board) ? 'game-board--compact' : '',
    game.path.length > 0 ? 'game-board--won' : '',
    solution ? 'game-board--solution' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const pathStep = (id: PlayerId) => {
    const i = game.path.indexOf(id)
    return i < 0 ? undefined : i
  }

  if (game.difficulty === 'easy') {
    return (
      <div
        ref={boardRef}
        className={boardClass}
        style={boardStyle}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <svg className="game-board-svg" aria-hidden="true">
          {[...playerPairEdges, ...solutionOnly].map((edge) => {
            const p1 = center(playerKey(edge.playerAId))
            const p2 = center(playerKey(edge.playerBId))
            if (!p1 || !p2) return null
            const isHovered = hoveredEdge === edge.key
            const isOnPath = pathPairKeys.has(edge.key)
            const isOnSolution = solutionPairKeys.has(edge.key)
            return (
              <g
                key={edge.key}
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onPointerEnter={() => setHoveredEdge(edge.key)}
                onPointerLeave={() => setHoveredEdge(null)}
                onClick={() => setSelectedEdge((prev) => (prev?.key === edge.key ? null : edge))}
              >
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={14} />
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  className={[
                    'graph-edge',
                    isOnPath ? 'graph-edge--path' : '',
                    isOnSolution ? 'graph-edge--solution' : '',
                    isHovered ? 'graph-edge--hovered' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              </g>
            )
          })}
        </svg>

        {[...nodes.entries()].map(([key, node]) => {
          if (node.kind !== 'player') return null
          const pos = positions.get(key)
          if (!pos) return null
          const p = playerById.get(node.id)
          return (
            <NodeCard
              key={key}
              nodeKey={key}
              label={playerMap.get(node.id) ?? node.id}
              kind="player"
              nationality={p?.nationality ? nationalTeamFor(p.nationality, p.sport) : undefined}
              position={pos}
              onPointerDown={handlePointerDown}
              onOpen={onOpenPlayer && p ? () => openCareer(key) : undefined}
              isDragging={dragging?.key === key}
              highlighted={game.path.includes(node.id)}
              pathStep={pathStep(node.id)}
              target={isTarget(node.id)}
              fameFloor={isTarget(node.id) ? undefined : p?.fameFloor}
              solution={onSolution(node.id)}
              proposed={!game.nodes.has(key)}
            />
          )
        })}

        {selectedEdge && (
          <div className="edge-popup">
            <button
              type="button"
              className="edge-popup__close"
              onClick={() => setSelectedEdge(null)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="edge-popup__players">
              {playerMap.get(selectedEdge.playerAId) ?? selectedEdge.playerAId}
              {' — '}
              {playerMap.get(selectedEdge.playerBId) ?? selectedEdge.playerBId}
            </p>
            <ul className="edge-popup__connections">
              {selectedEdge.connections.map((c) => (
                <li key={`${c.clubId}:${c.season}`}>
                  <ClubLogo club={clubById.get(c.clubId) ?? {}} />
                  {clubMap.get(c.clubId) ?? c.clubId} · {c.season}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ── Hard mode (bipartite) ──────────────────────────────────────────────────

  const pathPlayerKeys = new Set(game.path.map((id: PlayerId) => playerKey(id)))
  const pathClubKeys = new Set<string>()
  /** Where each club sits along the chain: players at even steps, the club linking them in between. */
  const clubSteps = new Map<string, number>()
  const pathEdgeSet = new Set<string>()

  if (game.path.length >= 2) {
    for (let i = 0; i < game.path.length - 1; i++) {
      const pA = game.path[i]
      const pB = game.path[i + 1]
      const membershipsA = new Set(game.edges.filter((e) => e.playerId === pA).map((e) => `${e.clubId}:${e.season}`))
      for (const e of game.edges) {
        if (e.playerId === pB && membershipsA.has(`${e.clubId}:${e.season}`)) {
          pathClubKeys.add(clubKey(e.clubId, e.season))
          if (!clubSteps.has(clubKey(e.clubId, e.season))) clubSteps.set(clubKey(e.clubId, e.season), 2 * i + 1)
          pathEdgeSet.add(`${pA}:${e.clubId}:${e.season}`)
          pathEdgeSet.add(`${pB}:${e.clubId}:${e.season}`)
        }
      }
    }
  }

  return (
    <div
      ref={boardRef}
      className={boardClass}
      style={boardStyle}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <svg className="game-board-svg" aria-hidden="true">
        {game.edges.map((edge, i) => {
          const p1 = center(playerKey(edge.playerId))
          const p2 = center(clubKey(edge.clubId, edge.season))
          if (!p1 || !p2) return null
          const onPath = pathEdgeSet.has(`${edge.playerId}:${edge.clubId}:${edge.season}`)
          return (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              className={onPath ? 'graph-edge graph-edge--path' : 'graph-edge'}
            />
          )
        })}
      </svg>

      {[...game.nodes.entries()].map(([key, node]) => {
        const pos = positions.get(key)
        if (!pos) return null

        let label: string
        let sublabel: string | undefined
        let kind: 'player' | 'club'
        let highlighted: boolean
        let imageUrl: string | undefined
        let nationality: Player['nationality']
        let fameFloor: Player['fameFloor']
        let step: number | undefined

        if (node.kind === 'player') {
          label = playerMap.get(node.id) ?? node.id
          kind = 'player'
          highlighted = pathPlayerKeys.has(key)
          const i = pathStep(node.id)
          step = i === undefined ? undefined : 2 * i
          const p = playerById.get(node.id)
          nationality = p?.nationality ? nationalTeamFor(p.nationality, p.sport) : undefined
          fameFloor = isTarget(node.id) ? undefined : p?.fameFloor
        } else {
          label = clubMap.get(node.id) ?? node.id
          sublabel = node.season
          kind = 'club'
          highlighted = pathClubKeys.has(key)
          step = clubSteps.get(key)
          imageUrl = clubById.get(node.id)?.logoUrl
        }

        return (
          <NodeCard
            key={key}
            nodeKey={key}
            label={label}
            sublabel={sublabel}
            kind={kind}
            imageUrl={imageUrl}
            nationality={nationality}
            position={pos}
            onPointerDown={handlePointerDown}
            onOpen={onOpenPlayer && node.kind === 'player' ? () => openCareer(key) : undefined}
            isDragging={dragging?.key === key}
            highlighted={highlighted}
            pathStep={step}
            target={node.kind === 'player' && isTarget(node.id)}
            fameFloor={fameFloor}
          />
        )
      })}
    </div>
  )
}
