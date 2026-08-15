import { createEngine } from '@/game/engine'
import { playerKey, clubKey } from '@/game/graphBuilder'
import { players, memberships } from '../../fixtures/mockData'
import { PlayerId, ClubId } from '@/domain/ids'
import { Season } from '@/domain/season'

const byId = (id: string) => players.find(p => p.id === id)!

// ── Easy mode ────────────────────────────────────────────────────────────────

describe('easy mode — seed and graph expansion', () => {
  it('creates only two player nodes and no clubs at engine creation', () => {
    const engine = createEngine(byId('p01'), byId('p06'), 'easy', memberships)
    const { nodes, edges } = engine.game

    expect(nodes.size).toBe(2)
    expect(nodes.has(playerKey(PlayerId('p01')))).toBe(true)
    expect(nodes.has(playerKey(PlayerId('p06')))).toBe(true)
    expect(edges).toHaveLength(0)
  })

  it('adds player node + edges (no club nodes) when a bridge player is submitted', () => {
    // p01 (Toulouse 2022-23), p07 (Bordeaux 2022-23) — not directly connected
    // p04 (Toulouse 2022-23) shares with p01
    const engine = createEngine(byId('p01'), byId('p07'), 'easy', memberships)

    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p04') })
    expect(result.ok).toBe(true)

    const { nodes, edges } = engine.game

    expect(nodes.has(playerKey(PlayerId('p04')))).toBe(true)
    // No club nodes in easy mode
    expect([...nodes.keys()].every(k => k.startsWith('player:'))).toBe(true)

    // Edges store club+season metadata but no club node is created
    expect(edges.some(e => e.playerId === 'p04' && e.clubId === 'stade-toulousain')).toBe(true)
    expect(edges.some(e => e.playerId === 'p01' && e.clubId === 'stade-toulousain')).toBe(true)
  })

  it('does not create duplicate edges across multiple shared seasons', () => {
    const engine = createEngine(byId('p01'), byId('p06'), 'easy', memberships)
    engine.addInput({ kind: 'easy', playerId: PlayerId('p02') })
    const { nodes } = engine.game
    // Still no club nodes
    expect([...nodes.keys()].every(k => k.startsWith('player:'))).toBe(true)
  })
})

describe('easy mode — BFS solution path', () => {
  it('detects victory after submitting a player who bridges A and B via a shared club:season', () => {
    // p01 and p02 both at Toulouse 2022-23; submitting p03 (also Toulouse 2022-23) wires edges
    const engine = createEngine(byId('p01'), byId('p02'), 'easy', memberships)

    expect(engine.isVictory()).toBe(false)

    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p03') })
    expect(result.ok).toBe(true)
    expect(engine.isVictory()).toBe(true)

    const path = engine.game.path
    expect(path).toHaveLength(2)
    expect(path[0]).toBe('p01')
    expect(path[1]).toBe('p02')
  })

  it('path remains empty while graph is not fully connected', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'easy', memberships)

    const r1 = engine.addInput({ kind: 'easy', playerId: PlayerId('p04') })
    expect(r1.ok).toBe(true)
    expect(engine.isVictory()).toBe(false)
    expect(engine.game.path).toHaveLength(0)

    const r2 = engine.addInput({ kind: 'easy', playerId: PlayerId('p09') })
    expect(r2.ok).toBe(true)
    expect(engine.isVictory()).toBe(false)
  })
})

// ── Hard mode ────────────────────────────────────────────────────────────────

describe('hard mode — club:season node and player node additions', () => {
  it('adds a club:season node connected to an existing player', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)

    const result = engine.addInput({
      kind: 'hard-club',
      clubId: ClubId('stade-toulousain'),
      season: Season('2022-2023'),
    })
    expect(result.ok).toBe(true)

    const { nodes, edges } = engine.game
    expect(nodes.has(clubKey(ClubId('stade-toulousain'), Season('2022-2023')))).toBe(true)
    expect(edges.some(e => e.playerId === 'p01' && e.clubId === 'stade-toulousain' && e.season === '2022-2023')).toBe(true)
  })

  it('adds a player node connected to an existing club:season node', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)

    // First add the club node
    engine.addInput({ kind: 'hard-club', clubId: ClubId('stade-toulousain'), season: Season('2022-2023') })

    // Then add p04 who also played at Toulouse 2022-23
    const result = engine.addInput({ kind: 'hard-player', playerId: PlayerId('p04') })
    expect(result.ok).toBe(true)

    const { nodes, edges } = engine.game
    expect(nodes.has(playerKey(PlayerId('p04')))).toBe(true)
    expect(edges.some(e => e.playerId === 'p04' && e.clubId === 'stade-toulousain' && e.season === '2022-2023')).toBe(true)
  })

  it('rejects a hard-player if they share no existing club:season node', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)
    // No club nodes yet — p04 has nowhere to connect
    const result = engine.addInput({ kind: 'hard-player', playerId: PlayerId('p04') })
    expect(result.ok).toBe(false)
  })

  it('rejects a hard-club if no existing player played there', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)
    // p01 and p07 are not at Toulon — no one in graph played there
    const result = engine.addInput({ kind: 'hard-club', clubId: ClubId('toulon'), season: Season('2022-2023') })
    expect(result.ok).toBe(false)
  })
})
