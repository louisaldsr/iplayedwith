import {
  BoardState,
  Point,
  Size,
  cardSizeFor,
  centreOf,
  floatingZones,
  fromFraction,
  placeCard,
  settleCard,
  targetSpots,
  toFraction,
} from '@/components/game/boardLayout'

const DESKTOP: Size = { w: 1400, h: 760 }
const PHONE: Size = { w: 390, h: 690 }

const overlap = (p: Point, q: Point, card: Size) =>
  Math.min(p.x, q.x) + card.w > Math.max(p.x, q.x) && Math.min(p.y, q.y) + card.h > Math.max(p.y, q.y)

/** A board with A and B on their spots; `grow` adds a card linked to `to`, placed as the board would. */
function boardOf(board: Size) {
  const card = cardSizeFor(board)
  const ends = targetSpots(board, card)
  const state: BoardState = {
    board,
    card,
    placed: new Map([
      ['A', ends.a],
      ['B', ends.b],
    ]),
    links: [],
    aKey: 'A',
    bKey: 'B',
  }
  const grow = (key: string, to: string) => {
    state.links.push([key, to])
    const spot = placeCard(key, state)
    state.placed.set(key, spot)
    return centreOf(spot, card)
  }
  const centre = (key: string) => centreOf(state.placed.get(key)!, card)
  return { state, card, grow, centre }
}

describe('card size', () => {
  it('shrinks on a phone, held upright or sideways', () => {
    expect(cardSizeFor(DESKTOP)).toEqual({ w: 160, h: 90 })
    expect(cardSizeFor(PHONE).w).toBeLessThan(160)
    expect(cardSizeFor({ w: 844, h: 250 }).w).toBeLessThan(160)
  })
})

describe('A and B', () => {
  it('sit left and right on a wide board', () => {
    const { a, b } = targetSpots(DESKTOP, cardSizeFor(DESKTOP))

    expect(a.y).toBe(b.y)
    expect(a.x).toBeLessThan(b.x)
  })

  // Side by side, two cards fill a phone's width: A and B overlapped at 390px.
  it('sit top and bottom on a phone, clear of each other', () => {
    const card = cardSizeFor(PHONE)
    const { a, b } = targetSpots(PHONE, card)

    expect(a.x).toBe(b.x)
    expect(a.y).toBeLessThan(b.y)
    expect(overlap(a, b, card)).toBe(false)
  })

  it('stay clear of the hearts and the toast', () => {
    const card = cardSizeFor(PHONE)
    const { a, b } = targetSpots(PHONE, card)

    for (const zone of floatingZones(PHONE)) {
      for (const p of [a, b]) {
        const clear =
          p.y + card.h <= zone.y || p.y >= zone.y + zone.h || p.x + card.w <= zone.x || p.x >= zone.x + zone.w
        expect(clear).toBe(true)
      }
    }
  })
})

describe('a new card', () => {
  it('linked to A, heads for B', () => {
    const { grow, centre } = boardOf(DESKTOP)

    const p = grow('p1', 'A')

    expect(p.x).toBeGreaterThan(centre('A').x)
    expect(p.x).toBeLessThan(centre('B').x)
  })

  it('linked to B, heads for A', () => {
    const { grow, centre } = boardOf(DESKTOP)

    const p = grow('p1', 'B')

    expect(p.x).toBeLessThan(centre('B').x)
    expect(p.x).toBeGreaterThan(centre('A').x)
  })

  it('extending a chain from A, lands further toward B', () => {
    const { grow } = boardOf(DESKTOP)

    const first = grow('p1', 'A')
    const second = grow('p2', 'p1')

    expect(second.x).toBeGreaterThan(first.x)
  })

  it('on a phone, grows down from A and up from B', () => {
    const { grow, centre } = boardOf(PHONE)

    const fromA = grow('p1', 'A')
    const fromB = grow('p2', 'B')

    expect(fromA.y).toBeGreaterThan(centre('A').y)
    expect(fromB.y).toBeLessThan(centre('B').y)
    expect(fromA.y).toBeLessThan(fromB.y)
  })

  it('aims for the spot it is given — a proposed solution player, on the chain', () => {
    const { state, card } = boardOf(DESKTOP)
    const aim = { x: 700, y: 380 }

    const spot = placeCard('p1', state, aim)

    expect(centreOf(spot, card)).toEqual(aim)
  })

  // Every card used to fall back to the same corner once the free spots ran out.
  it.each([
    { name: 'desktop', board: DESKTOP, count: 20 },
    { name: 'phone', board: PHONE, count: 12 },
  ])('never covers another card, $count of them on a $name board', ({ board, count }) => {
    const { state, card, grow } = boardOf(board)
    const anchors = ['A', 'B']

    for (let i = 0; i < count; i++) {
      grow(`p${i}`, anchors[i % anchors.length])
      anchors.push(`p${i}`)
    }

    const spots = [...state.placed.values()]
    for (let i = 0; i < spots.length; i++) {
      const p = spots[i]
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + card.w).toBeLessThanOrEqual(board.w)
      expect(p.y + card.h).toBeLessThanOrEqual(board.h)
      for (let j = i + 1; j < spots.length; j++) expect(overlap(p, spots[j], card)).toBe(false)
    }
  })

  it('keeps out from under an existing link', () => {
    const { state, card, grow, centre } = boardOf(DESKTOP)
    grow('p1', 'A')
    grow('p2', 'p1')
    grow('p3', 'p2')

    // Linked to A too: the straight line A → p3 is where it would like to sit, and it does not.
    const spot = placeCard('p4', { ...state, links: [...state.links, ['p4', 'A']] })

    const a = centre('A')
    const p3 = centre('p3')
    const onLine = spot.y < a.y && spot.y + card.h > a.y && spot.x < p3.x && spot.x + card.w > a.x
    expect(onLine).toBe(false)
  })
})

describe('a dropped card', () => {
  it('stays where it is let go on free ground', () => {
    const { state } = boardOf(DESKTOP)
    const at = { x: 600, y: 120 }

    expect(settleCard('p1', at, state)).toBe(at)
  })

  it('slides off a card it is dropped on, to the nearest free spot', () => {
    const { state, card } = boardOf(DESKTOP)
    const a = state.placed.get('A')!
    const at = { x: a.x + 10, y: a.y + 10 }

    const spot = settleCard('p1', at, state)

    expect(overlap(spot, a, card)).toBe(false)
    expect(Math.hypot(spot.x - at.x, spot.y - at.y)).toBeLessThan(card.w + card.h)
  })
})

describe('fractions', () => {
  it('round-trip on the same board', () => {
    const card = cardSizeFor(DESKTOP)
    const p = { x: 320, y: 140 }

    expect(fromFraction(toFraction(p, DESKTOP, card), DESKTOP, card)).toEqual(p)
  })

  // A keyboard opening or a phone turned: the board shrinks, its cards stay on it.
  it('keep a card on a board that shrank', () => {
    const card = cardSizeFor(DESKTOP)
    const right = toFraction({ x: DESKTOP.w - card.w, y: DESKTOP.h - card.h }, DESKTOP, card)
    const smaller = { w: 1000, h: 400 }

    const p = fromFraction(right, smaller, card)

    expect(p.x + card.w).toBe(smaller.w)
    expect(p.y + card.h).toBe(smaller.h)
  })
})
