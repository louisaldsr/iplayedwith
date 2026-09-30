import { createRemoteEngine } from '@/game/remoteEngine'
import { ClubId, PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'
import { Player } from '@/domain/player'

const playerA: Player = { id: PlayerId('p-a'), name: 'Alpha', sport: 'rugby' }
const playerB: Player = { id: PlayerId('p-b'), name: 'Bravo', sport: 'rugby' }
const charlie: Player = { id: PlayerId('p-c'), name: 'Charlie', sport: 'rugby' }
const club = { id: ClubId('c-1'), name: 'Club Un', sport: 'rugby' as const }
const edges = [
  { playerId: PlayerId('p-c'), clubId: ClubId('c-1'), season: Season('2016-2017') },
  { playerId: PlayerId('p-a'), clubId: ClubId('c-1'), season: Season('2016-2017') },
]

const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
})

describe('createRemoteEngine — resuming a saved board', () => {
  const startedAt = new Date('2026-07-15T07:45:00Z')
  const resume = () =>
    createRemoteEngine('rugby', playerA, playerB, 'easy', {
      nodes: [
        { kind: 'player', id: playerA.id },
        { kind: 'player', id: playerB.id },
        { kind: 'player', id: charlie.id },
      ],
      edges,
      players: [playerA, charlie],
      clubs: [club],
      startedAt,
    })

  it('rebuilds the board, without duplicating A and B', () => {
    const engine = resume()
    expect([...engine.game.nodes.keys()]).toHaveLength(3)
    expect(engine.game.edges).toEqual(edges)
    expect(engine.game.startedAt).toBe(startedAt)
    expect(engine.players.map((p) => p.id)).toEqual(['p-a', 'p-b', 'p-c'])
    expect(engine.clubs).toEqual([club])
    expect(engine.isVictory()).toBe(false)
  })

  it('sends the resumed graph with the next move, for the server to revalidate', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, code: 'not-connected', reason: '…' }),
    })
    global.fetch = fetchMock

    await resume().addInput({ kind: 'easy', playerId: PlayerId('p-d') })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.graph).toEqual({ players: ['p-a', 'p-b', 'p-c'], clubs: [], edges })
  })
})
