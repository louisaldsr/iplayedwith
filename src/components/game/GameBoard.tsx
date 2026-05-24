import { useEffect, useRef, useState } from 'react'
import { Game } from '../../game/game'
import { Club } from '../../domain/club'
import { Player } from '../../domain/player'
import { PlayerId } from '../../domain/ids'
import { playerKey, clubKey } from '../../game/graphBuilder'
import { NodeCard } from './NodeCard'

const NODE_WIDTH = 160
const NODE_HEIGHT = 90
const MIN_GAP = 180

type Position = { x: number; y: number }
type DragState = {
  key: string
  startX: number
  startY: number
  originX: number
  originY: number
}

type Props = {
  game: Game
  players: Player[]
  clubs: Club[]
}

function findFreePosition(
  existing: Map<string, Position>,
  boardW: number,
  boardH: number,
): Position {
  const cx = boardW / 2
  const cy = boardH / 2
  for (let r = 0; r <= Math.max(boardW, boardH); r += MIN_GAP / 2) {
    const steps = r === 0 ? 1 : Math.max(6, Math.ceil((2 * Math.PI * r) / (MIN_GAP / 2)))
    for (let s = 0; s < steps; s++) {
      const angle = (s / steps) * 2 * Math.PI
      const x = cx + r * Math.cos(angle) - NODE_WIDTH / 2
      const y = cy + r * Math.sin(angle) - NODE_HEIGHT / 2
      if (x < 8 || y < 8 || x + NODE_WIDTH > boardW - 8 || y + NODE_HEIGHT > boardH - 8) continue
      const ncx = x + NODE_WIDTH / 2
      const ncy = y + NODE_HEIGHT / 2
      let ok = true
      for (const p of existing.values()) {
        const dx = p.x + NODE_WIDTH / 2 - ncx
        const dy = p.y + NODE_HEIGHT / 2 - ncy
        if (dx * dx + dy * dy < MIN_GAP * MIN_GAP) {
          ok = false
          break
        }
      }
      if (ok) return { x, y }
    }
  }
  return { x: 8, y: 8 }
}

function resolveOverlap(key: string, positions: Map<string, Position>): Map<string, Position> {
  const pos = positions.get(key)
  if (!pos) return positions
  let nx = pos.x
  let ny = pos.y
  const cx = pos.x + NODE_WIDTH / 2
  const cy = pos.y + NODE_HEIGHT / 2
  for (const [k, p] of positions) {
    if (k === key) continue
    const ox = p.x + NODE_WIDTH / 2
    const oy = p.y + NODE_HEIGHT / 2
    const dx = cx - ox
    const dy = cy - oy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 0 && dist < MIN_GAP) {
      const push = (MIN_GAP - dist) / 2
      nx += (dx / dist) * push
      ny += (dy / dist) * push
    }
  }
  return new Map(positions).set(key, { x: nx, y: ny })
}

export function GameBoard({ game, players, clubs }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<Map<string, Position>>(new Map())
  const [dragging, setDragging] = useState<DragState | null>(null)

  useEffect(() => {
    const pAKey = playerKey(game.playerA.id)
    const pBKey = playerKey(game.playerB.id)

    setPositions(prev => {
      const newKeys = [...game.nodes.keys()].filter(k => !prev.has(k))
      if (newKeys.length === 0) return prev

      const boardW = boardRef.current?.clientWidth ?? 800
      const boardH = boardRef.current?.clientHeight ?? 500
      const next = new Map(prev)

      const sorted = [...newKeys].sort((a, b) => {
        if (a === pAKey) return -1
        if (b === pAKey) return 1
        if (a === pBKey) return -1
        if (b === pBKey) return 1
        return 0
      })

      for (const key of sorted) {
        if (key === pAKey) {
          next.set(key, { x: boardW * 0.1, y: boardH / 2 - NODE_HEIGHT / 2 })
        } else if (key === pBKey) {
          next.set(key, { x: boardW * 0.82 - NODE_WIDTH, y: boardH / 2 - NODE_HEIGHT / 2 })
        } else {
          next.set(key, findFreePosition(next, boardW, boardH))
        }
      }

      return next
    })
  }, [game])

  const handlePointerDown = (e: React.PointerEvent, key: string) => {
    e.preventDefault()
    const pos = positions.get(key)
    if (!pos) return
    setDragging({ key, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y })
    boardRef.current?.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const boardW = boardRef.current?.clientWidth ?? 800
    const boardH = boardRef.current?.clientHeight ?? 500
    const nx = Math.max(0, Math.min(dragging.originX + (e.clientX - dragging.startX), boardW - NODE_WIDTH))
    const ny = Math.max(0, Math.min(dragging.originY + (e.clientY - dragging.startY), boardH - NODE_HEIGHT))
    setPositions(prev => new Map(prev).set(dragging.key, { x: nx, y: ny }))
  }

  const handlePointerUp = () => {
    if (!dragging) return
    setPositions(prev => resolveOverlap(dragging.key, prev))
    setDragging(null)
  }

  const playerMap = new Map(players.map(p => [p.id as string, p.name]))
  const clubMap = new Map(clubs.map(c => [c.id as string, c.name]))

  const pathPlayerKeys = new Set(game.path.map((id: PlayerId) => playerKey(id)))
  const pathClubKeys = new Set<string>()
  const pathEdgeSet = new Set<string>()

  if (game.path.length >= 2) {
    for (let i = 0; i < game.path.length - 1; i++) {
      const pA = game.path[i]
      const pB = game.path[i + 1]
      const clubsA = new Set(
        game.edges.filter(e => e.playerId === pA).map(e => `${e.clubId}:${e.season}`),
      )
      for (const e of game.edges) {
        if (e.playerId === pB && clubsA.has(`${e.clubId}:${e.season}`)) {
          const ck = `${e.clubId}:${e.season}`
          pathClubKeys.add(ck)
          pathEdgeSet.add(`${pA}:${ck}`)
          pathEdgeSet.add(`${pB}:${ck}`)
        }
      }
    }
  }

  const center = (key: string): { x: number; y: number } | null => {
    const p = positions.get(key)
    if (!p) return null
    return { x: p.x + NODE_WIDTH / 2, y: p.y + NODE_HEIGHT / 2 }
  }

  return (
    <div
      ref={boardRef}
      className="game-board"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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

        if (node.kind === 'player') {
          label = playerMap.get(node.id) ?? node.id
          kind = 'player'
          highlighted = pathPlayerKeys.has(key)
        } else {
          label = clubMap.get(node.id) ?? node.id
          sublabel = node.season
          kind = 'club'
          highlighted = pathClubKeys.has(`${node.id}:${node.season}`)
        }

        return (
          <NodeCard
            key={key}
            nodeKey={key}
            label={label}
            sublabel={sublabel}
            kind={kind}
            position={pos}
            onPointerDown={handlePointerDown}
            isDragging={dragging?.key === key}
            highlighted={highlighted}
          />
        )
      })}
    </div>
  )
}
