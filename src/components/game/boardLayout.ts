/**
 * Where a card goes on the board — geometry only, no React.
 *
 * Cards live in a **world**: a plane sized once, from the board as first measured, a little larger
 * than it on a phone (`PHONE_ZOOM`). A point is a card's top-left corner, in world pixels. The board
 * draws the world through a **camera** — one uniform scale that fits it in view — so a keyboard
 * opening, a toolbar showing, only zooms: no card ever moves against another.
 */

export type Size = { w: number; h: number }
export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

const FULL_CARD: Size = { w: 160, h: 90 }
const COMPACT_CARD: Size = { w: 116, h: 60 }

/** Smaller cards on a board narrower than a tablet, or as shallow as a phone held sideways. */
export function isCompact(board: Size): boolean {
  return board.w < 640 || board.h < 420
}

export function cardSizeFor(board: Size): Size {
  return isCompact(board) ? COMPACT_CARD : FULL_CARD
}

/** Room kept between two cards, and between a card and the board's edge. */
export function gapFor(card: Size): number {
  return card.w < FULL_CARD.w ? 12 : 20
}

/** How far a card sits from the card it extends the chain from: enough to see — and tap — the link. */
function linkLengthFor(card: Size): number {
  return card.w < FULL_CARD.w ? 28 : 60
}

/**
 * What floats over the board, kept clear of cards: the refused-guess toast and the solution switch
 * at the top, the hearts in the top-left corner (see `.error-banner--toast`, `.solution-overlay`,
 * `.lives-bar`).
 * On screen, at the camera's usual zoom — in world pixels, they are that much larger.
 */
const TOP_ZONE: Size = { w: 280, h: 56 }
/** The hearts, stacked in the top-left corner. */
const HEARTS: Size = { w: 60, h: 140 }
/** The floating move field on a phone, from the screen's foot (`.game-screen-controls`). */
const FIELD_HEIGHT = 72

/** On a phone the move field floats over the board's foot — the same 640px as the CSS. */
export function fieldFloats(screen: Size): boolean {
  return screen.w <= 640
}

export function floatingZones(board: Size, zoom = 1): Rect[] {
  const top = { w: TOP_ZONE.w / zoom, h: TOP_ZONE.h / zoom }
  const hearts = { w: HEARTS.w / zoom, h: HEARTS.h / zoom }
  return [
    { x: (board.w - top.w) / 2, y: 0, ...top },
    { x: 0, y: 0, ...hearts },
  ]
}

/**
 * A and B, the two ends of the chain, along the board's long side: left and right on a wide board,
 * top and bottom on a phone — side by side, a phone has no room between them.
 */
export function targetSpots(board: Size, card: Size, zoom = 1): { a: Point; b: Point } {
  const gap = gapFor(card)
  if (board.w >= board.h) {
    const y = (board.h - card.h) / 2
    const inset = Math.max(gap, board.w * 0.06)
    return { a: { x: inset, y }, b: { x: board.w - card.w - inset, y } }
  }
  const x = (board.w - card.w) / 2
  const top = TOP_ZONE.h / zoom + gap
  return { a: { x, y: top }, b: { x, y: Math.max(top, board.h - gap - card.h) } }
}

export const centreOf = (p: Point, card: Size): Point => ({ x: p.x + card.w / 2, y: p.y + card.h / 2 })

// ── World and camera ─────────────────────────────────────────────────────────

/** A phone sees its board a little zoomed out: more of it in view. */
export const PHONE_ZOOM = 0.85

export type World = {
  size: Size
  card: Size
  compact: boolean
  /** The camera's scale when the board has all its room — what the floating controls are sized for. */
  zoom: number
  /** The move field floats over the board's foot: the world stops above it. */
  field: boolean
  /** The board's width the world was made for. */
  width: number
}

/** The part of the board cards may use: above the floating field, on a phone. */
export function usable(screen: Size): Size {
  return { w: screen.w, h: Math.max(1, screen.h - (fieldFloats(screen) ? FIELD_HEIGHT : 0)) }
}

export function worldFor(screen: Size): World {
  const room = usable(screen)
  const compact = isCompact(room)
  const zoom = compact ? PHONE_ZOOM : 1
  return {
    size: { w: room.w / zoom, h: room.h / zoom },
    card: cardSizeFor(room),
    compact,
    zoom,
    field: fieldFloats(screen),
    width: screen.w,
  }
}

/**
 * Whether the world still fits the board. Only a new width — a phone turned, a window resized —
 * makes a new one, every card placed again; a new height (the keyboard, a toolbar) only zooms.
 */
export function fitsWorld(world: World, screen: Size): boolean {
  return Math.abs(screen.w - world.width) <= world.width * 0.15
}

/**
 * How the world is drawn on the board: its scale, and where its top-left corner sits on screen.
 * Like a whiteboard's: the player pinches, scrolls and drags it; `fitView` is where it starts, and
 * where the "fit" button takes it back.
 */
export type View = { scale: number; x: number; y: number }

/** How far the player may zoom, out then in. */
export const ZOOM_LIMITS = { min: 0.3, max: 2.5 }

/**
 * The smallest the fitted view draws the world: names stay readable. With the keyboard open, a
 * phone has too little height left to fit the whole board above this — it shows the top (A's side),
 * the rest a drag away.
 */
export const MIN_SCALE = 0.7

/** The whole world in view above the field, centred — never below `MIN_SCALE`, top first when taller. */
export function fitView(world: World, screen: Size): View {
  const room = usable(screen)
  const fit = Math.min(room.w / world.size.w, room.h / world.size.h)
  const scale = Math.max(fit, Math.min(world.zoom, MIN_SCALE))
  const along = (roomLength: number, worldLength: number) => Math.max(0, (roomLength - worldLength * scale) / 2)
  return { scale, x: along(room.w, world.size.w), y: along(room.h, world.size.h) }
}

/** Zoomed by `factor` around `at` (a point on the board): what is under it stays under it. */
export function zoomAround(view: View, factor: number, at: Point): View {
  const scale = Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, view.scale * factor))
  const k = scale / view.scale
  return { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k }
}

/** How much of the world always stays on the board: it can be dragged aside, never lost. */
const KEEP_IN_VIEW = 96

export function clampView(view: View, world: World, screen: Size): View {
  const room = usable(screen)
  const along = (offset: number, roomLength: number, worldLength: number) => {
    const keep = Math.min(KEEP_IN_VIEW, roomLength / 2, worldLength * view.scale)
    return Math.min(roomLength - keep, Math.max(keep - worldLength * view.scale, offset))
  }
  return { scale: view.scale, x: along(view.x, room.w, world.size.w), y: along(view.y, room.h, world.size.h) }
}

/** The view moved just enough for a card (at `p`, in the world) to be wholly on the board above the field. */
export function revealCard(view: View, p: Point, card: Size, screen: Size): View {
  const room = usable(screen)
  const margin = 12
  const along = (offset: number, at: number, length: number, roomLength: number) => {
    const start = offset + at * view.scale
    const end = start + length * view.scale
    if (start < margin) return offset + (margin - start)
    if (end > roomLength - margin) return offset - Math.min(end - (roomLength - margin), start - margin)
    return offset
  }
  return { scale: view.scale, x: along(view.x, p.x, card.w, room.w), y: along(view.y, p.y, card.h, room.h) }
}

// ── Placing a card ───────────────────────────────────────────────────────────

export type BoardState = {
  board: Size
  card: Size
  /** Cards already placed, by node key. */
  placed: Map<string, Point>
  /** The board's links, by node key at each end — including those of the card being placed. */
  links: [string, string][]
  aKey: string
  bKey: string
  /** The world's usual zoom (`World.zoom`), which sizes the floating controls in world pixels. */
  zoom?: number
}

/**
 * Where a new card would sit best: next to the cards it links to, one step further toward the end
 * it has yet to reach — linked to A's side it heads for B, linked to B's side for A — so the chain
 * grows from both ends toward the middle and reads A → B. Linked to both sides, it sits between its
 * links; linked to nothing placed, between A and B.
 */
export function idealCentre(key: string, state: BoardState): Point {
  const { card, placed, links, aKey, bKey } = state
  const centre = (k: string) => centreOf(placed.get(k)!, card)
  const a = placed.has(aKey) ? centre(aKey) : { x: state.board.w / 2, y: state.board.h / 2 }
  const b = placed.has(bKey) ? centre(bKey) : a

  const neighbours = neighboursOf(key, links).filter((k) => placed.has(k))
  if (neighbours.length === 0) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }

  const m = mean(neighbours.map(centre))
  const sideA = reachable(aKey, links, key)
  const sideB = reachable(bKey, links, key)
  const touchesA = neighbours.some((n) => sideA.has(n))
  const touchesB = neighbours.some((n) => sideB.has(n))
  if (touchesA === touchesB) return m

  const goal = touchesA ? b : a
  const dx = goal.x - m.x
  const dy = goal.y - m.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return m
  const ux = dx / dist
  const uy = dy / dist
  const link = linkLengthFor(card)
  // One card further along that direction, never more than halfway to the goal.
  const step = Math.min(Math.abs(ux) * (card.w + link) + Math.abs(uy) * (card.h + link), dist / 2)
  return { x: m.x + ux * step, y: m.y + uy * step }
}

/** Covering another card or the floating controls outweighs any distance on the board. */
const OVERLAP_COST = 5000
/** A link running under the card, or one of its own links running through another card. */
const BURIED_LINK_COST = 300
/** One of its own links crossing another. */
const CROSSING_COST = 40
const COARSE_STEP = 16
const FINE_STEP = 4

/**
 * The spot for a new card, as close to `ideal` (a centre — by default `idealCentre`) as the board
 * allows without covering anything. A full board still gets the least crowded spot, never a pile
 * in one corner.
 */
export function placeCard(key: string, state: BoardState, ideal: Point = idealCentre(key, state)): Point {
  const { board, card, placed, links } = state
  const gap = gapFor(card)
  const rectOf = (p: Point): Rect => ({ ...p, ...card })

  const others = [...placed].filter(([k]) => k !== key).map(([k, p]) => ({ key: k, rect: rectOf(p) }))
  const obstacles = [...others.map((o) => o.rect), ...floatingZones(board, state.zoom)]
  const centre = (k: string) => centreOf(placed.get(k)!, card)
  const segments = links
    .filter(([p, q]) => p !== key && q !== key && placed.has(p) && placed.has(q))
    .map(([p, q]) => ({ ends: [p, q], from: centre(p), to: centre(q) }))
  const neighbours = neighboursOf(key, links).filter((k) => k !== key && placed.has(k))

  /** Stops counting past `bound`: every term is positive, so the spot already lost. */
  const cost = (p: Point, bound = Infinity): number => {
    const rect = rectOf(p)
    const here = centreOf(p, card)
    let total = Math.hypot(here.x - ideal.x, here.y - ideal.y)
    if (total >= bound) return total

    const padded = inflate(rect, gap / 2)
    for (const o of obstacles) total += (OVERLAP_COST * overlapArea(padded, inflate(o, gap / 2))) / (card.w * card.h)

    for (const s of segments) if (segmentHitsRect(s.from, s.to, rect)) total += BURIED_LINK_COST

    for (const n of neighbours) {
      const to = centre(n)
      for (const o of others) {
        if (o.key !== n && segmentHitsRect(here, to, o.rect)) total += BURIED_LINK_COST
      }
      for (const s of segments) {
        if (!s.ends.includes(n) && segmentsCross(here, to, s.from, s.to)) total += CROSSING_COST
      }
    }
    return total
  }

  const minX = gap
  const maxX = board.w - card.w - gap
  const minY = gap
  const maxY = board.h - card.h - gap
  let best: Point = clampToBoard({ x: ideal.x - card.w / 2, y: ideal.y - card.h / 2 }, board, card)
  let bestCost = cost(best)
  const scan = (xs: number[], ys: number[]) => {
    for (const y of ys) {
      for (const x of xs) {
        const c = cost({ x, y }, bestCost)
        if (c < bestCost) {
          best = { x, y }
          bestCost = c
        }
      }
    }
  }
  // The whole board on a coarse grid, then a finer one around the best spot found.
  scan(axis(minX, maxX, COARSE_STEP), axis(minY, maxY, COARSE_STEP))
  const { x, y } = best
  scan(
    axis(Math.max(minX, x - COARSE_STEP), Math.min(maxX, x + COARSE_STEP), FINE_STEP),
    axis(Math.max(minY, y - COARSE_STEP), Math.min(maxY, y + COARSE_STEP), FINE_STEP),
  )
  return best
}

/**
 * Where a dragged card settles once dropped: where it was let go, unless it lands on another card —
 * then the nearest spot that covers none.
 */
export function settleCard(key: string, at: Point, state: BoardState): Point {
  const { card } = state
  const rect: Rect = { ...at, ...card }
  const clear = [...state.placed].every(([k, p]) => k === key || overlapArea(rect, { ...p, ...card }) === 0)
  if (clear) return at
  return placeCard(key, { ...state, links: [] }, centreOf(at, card))
}

// ── Geometry ─────────────────────────────────────────────────────────────────

function axis(min: number, max: number, step: number): number[] {
  if (max <= min) return [Math.max(0, (min + max) / 2)]
  const out: number[] = []
  for (let v = min; v < max; v += step) out.push(v)
  out.push(max)
  return out
}

function clampToBoard(p: Point, board: Size, card: Size): Point {
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, board.w - card.w)),
    y: Math.min(Math.max(0, p.y), Math.max(0, board.h - card.h)),
  }
}

const inflate = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by })

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Whether the segment p→q passes through the rectangle (Liang–Barsky clipping). */
function segmentHitsRect(p: Point, q: Point, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = q.x - p.x
  const dy = q.y - p.y
  const edges: [number, number][] = [
    [-dx, p.x - r.x],
    [dx, r.x + r.w - p.x],
    [-dy, p.y - r.y],
    [dy, r.y + r.h - p.y],
  ]
  for (const [d, dist] of edges) {
    if (d === 0) {
      if (dist < 0) return false
      continue
    }
    const t = dist / d
    if (d < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const side = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  return side(p1, p2, q1) * side(p1, p2, q2) < 0 && side(q1, q2, p1) * side(q1, q2, p2) < 0
}

const mean = (points: Point[]): Point => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
})

// ── Graph ────────────────────────────────────────────────────────────────────

function neighboursOf(key: string, links: [string, string][]): string[] {
  const out = new Set<string>()
  for (const [p, q] of links) {
    if (p === key) out.add(q)
    else if (q === key) out.add(p)
  }
  return [...out]
}

/** The cards reachable from `start` over the links, never through `without`. */
function reachable(start: string, links: [string, string][], without: string): Set<string> {
  const seen = new Set([start])
  const queue = [start]
  while (queue.length > 0) {
    const k = queue.shift()!
    for (const n of neighboursOf(k, links)) {
      if (n === without || seen.has(n)) continue
      seen.add(n)
      queue.push(n)
    }
  }
  return seen
}
