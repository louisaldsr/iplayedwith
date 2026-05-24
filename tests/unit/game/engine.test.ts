import { createEngine } from '@/game/engine'
import { players, memberships } from '@/mock/data'
import { PlayerId, ClubId } from '@/domain/ids'
import { Season } from '@/domain/season'

const byId = (id: string) => players.find(p => p.id === id)!

describe('createEngine', () => {
  it('seeds both playerA and playerB into the graph', () => {
    const engine = createEngine(byId('p1'), byId('p4'), 'easy', memberships)
    expect(engine.game.nodes.has('player:p1')).toBe(true)
    expect(engine.game.nodes.has('player:p4')).toBe(true)
  })

  it('is not a victory at creation when players share no club-season', () => {
    // p1 (Toulouse 2022-23) and p4 (Racing 2022-23) share no club-season
    const engine = createEngine(byId('p1'), byId('p4'), 'easy', memberships)
    expect(engine.isVictory()).toBe(false)
  })

  it('is already a victory at creation when players share a club-season', () => {
    // p1 and p2 both played stade-toulousain 2022-2023
    const engine = createEngine(byId('p1'), byId('p2'), 'easy', memberships)
    expect(engine.isVictory()).toBe(true)
  })
})

describe('addInput — duplicate player refused', () => {
  it('refuses playerA who is already seeded', () => {
    const engine = createEngine(byId('p1'), byId('p4'), 'easy', memberships)
    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p1') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/déjà dans le graphe/)
  })

  it('refuses playerB who is already seeded', () => {
    const engine = createEngine(byId('p1'), byId('p4'), 'easy', memberships)
    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p4') })
    expect(result.ok).toBe(false)
  })
})

describe('addInput — no shared club-season refused', () => {
  it('refuses a player with no overlap with any existing graph node', () => {
    // p1 (Toulouse 2022-23) vs p7 (Clermont 2022-23)
    // p10 is La Rochelle 2022-23 only — no club-season overlap with either seeded cluster
    const engine = createEngine(byId('p1'), byId('p7'), 'easy', memberships)
    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p10') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/aucun club/)
  })
})

describe('addInput — game already won', () => {
  it('refuses further input after victory', () => {
    // p1 and p2 share Toulouse 2022-23 — connected at creation
    const engine = createEngine(byId('p1'), byId('p2'), 'easy', memberships)
    expect(engine.isVictory()).toBe(true)
    const result = engine.addInput({ kind: 'easy', playerId: PlayerId('p3') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/terminée/)
  })
})

describe('addInput — victory populates game.path', () => {
  it('sets game.path from playerA to playerB when they share a club-season at creation', () => {
    // p4 and p5 both played Racing 2022-23
    const engine = createEngine(byId('p4'), byId('p5'), 'easy', memberships)
    expect(engine.isVictory()).toBe(true)
    expect(engine.game.path[0]).toBe('p4')
    expect(engine.game.path[engine.game.path.length - 1]).toBe('p5')
  })
})

describe('addInput — hard mode', () => {
  it('accepts a valid explicit (player, club, season) link', () => {
    // p4 (Racing 2022-23) vs p7 (Clermont 2022-23)
    // p17 is Clermont 2022-23 → shares with p7's seeded cluster
    const engine = createEngine(byId('p4'), byId('p7'), 'hard', memberships)
    const result = engine.addInput({
      kind: 'hard',
      playerId: PlayerId('p17'),
      clubId: ClubId('clermont'),
      season: Season('2022-2023'),
    })
    expect(result.ok).toBe(true)
  })

  it('refuses when the given club-season is not yet in the graph', () => {
    // p1 (Toulouse 2022-23) vs p4 (Racing 2022-23) — Bordeaux not seeded
    const engine = createEngine(byId('p1'), byId('p4'), 'hard', memberships)
    const result = engine.addInput({
      kind: 'hard',
      playerId: PlayerId('p13'),
      clubId: ClubId('bordeaux-begles'),
      season: Season('2022-2023'),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Aucun joueur/)
  })
})
