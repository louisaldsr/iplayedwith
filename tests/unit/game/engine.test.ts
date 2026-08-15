import { createEngine } from '@/game/engine'
import { players, memberships } from '../../fixtures/mockData'
import { PlayerId, ClubId } from '@/domain/ids'
import { Season } from '@/domain/season'

const byId = (id: string) => players.find(p => p.id === id)!

describe('createEngine', () => {
  it('seeds both playerA and playerB into the graph', () => {
    const engine = createEngine(byId('p01'), byId('p04'), 'easy', memberships)
    expect(engine.game.nodes.has('player:p01')).toBe(true)
    expect(engine.game.nodes.has('player:p04')).toBe(true)
  })

  it('is not a victory at creation — no edges seeded', () => {
    const engine = createEngine(byId('p01'), byId('p04'), 'easy', memberships)
    expect(engine.isVictory()).toBe(false)
  })

  it('is not a victory even when players share a club-season — edges are only wired on addInput', () => {
    // p01 and p02 both played Toulouse 2022-23, but no edges exist until a player is submitted
    const engine = createEngine(byId('p01'), byId('p02'), 'easy', memberships)
    expect(engine.isVictory()).toBe(false)
  })
})

describe('addInput — duplicate player refused', () => {
  it('refuses playerA who is already seeded', () => {
    const engine = createEngine(byId('p01'), byId('p04'), 'easy', memberships)
    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p01') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/déjà dans le graphe/)
  })

  it('refuses playerB who is already seeded', () => {
    const engine = createEngine(byId('p01'), byId('p04'), 'easy', memberships)
    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p04') })
    expect(result.ok).toBe(false)
  })
})

describe('addInput — no shared club-season refused', () => {
  it('refuses a player with no overlap with any existing graph node', () => {
    // p01 (Toulouse) vs p07 (Bordeaux); p11 is Toulon only — no overlap
    const engine = createEngine(byId('p01'), byId('p07'), 'easy', memberships)
    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p11') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/aucun club/)
  })
})

describe('addInput — game already won', () => {
  it('refuses further input after victory is detected', () => {
    // p01 and p02 share Toulouse 2022-23; submitting p03 (also Toulouse 2022-23) triggers victory
    const engine = createEngine(byId('p01'), byId('p02'), 'easy', memberships)
    engine.addInput({ kind: 'easy', playerId: PlayerId('p03') })
    expect(engine.isVictory()).toBe(true)

    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p04') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/terminée/)
  })
})

describe('addInput — victory populates game.path', () => {
  it('sets game.path from playerA to playerB after connecting them', () => {
    // p01 and p02 share Toulouse 2022-23; p03 bridges them
    const engine = createEngine(byId('p01'), byId('p02'), 'easy', memberships)
    engine.addInput({ kind: 'easy', playerId: PlayerId('p03') })

    expect(engine.isVictory()).toBe(true)
    expect(engine.game.path[0]).toBe('p01')
    expect(engine.game.path[engine.game.path.length - 1]).toBe('p02')
  })
})

describe('addInput — hard mode', () => {
  it('accepts a valid club:season that an existing player played at', () => {
    // p01 (Toulouse 2022-23) vs p07 (Bordeaux 2022-23)
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)
    const result = engine.addInput({
      kind: 'hard-club',
      clubId: ClubId('stade-toulousain'),
      season: Season('2022-2023'),
    })
    expect(result.ok).toBe(true)
  })

  it('accepts a player who played at an existing club:season node', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)
    engine.addInput({ kind: 'hard-club', clubId: ClubId('stade-toulousain'), season: Season('2022-2023') })

    const result = engine.addInput({ kind: 'hard-player', playerId: PlayerId('p04') })
    expect(result.ok).toBe(true)
  })

  it('refuses a player when no club:season node is in the graph yet', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)
    const result = engine.addInput({ kind: 'hard-player', playerId: PlayerId('p04') })
    expect(result.ok).toBe(false)
  })

  it('refuses a club:season when no existing player played there', () => {
    const engine = createEngine(byId('p01'), byId('p07'), 'hard', memberships)
    // p01 and p07 never played at Toulon
    const result = engine.addInput({
      kind: 'hard-club',
      clubId: ClubId('toulon'),
      season: Season('2022-2023'),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Aucun joueur/)
  })
})
