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
      resume: {
        nodes: [
          { kind: 'player', id: playerA.id },
          { kind: 'player', id: playerB.id },
          { kind: 'player', id: charlie.id },
        ],
        edges,
        players: [playerA, charlie],
        clubs: [club],
        startedAt,
      },
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

  it('comes back over when the saved board is a won one', async () => {
    const path = [playerA.id, charlie.id, playerB.id]
    const engine = createRemoteEngine('rugby', playerA, playerB, 'easy', {
      resume: {
        nodes: [{ kind: 'player', id: charlie.id }],
        edges,
        players: [charlie],
        clubs: [club],
        startedAt,
        path,
      },
    })
    expect(engine.isVictory()).toBe(true)
    expect(engine.game.path).toEqual(path)
    expect(await engine.addInput({ kind: 'easy', playerId: PlayerId('p-d') })).toMatchObject({ code: 'game-over' })
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

describe('createRemoteEngine — daily moves', () => {
  const answer = () =>
    jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, code: 'not-connected', reason: '…' }) })

  it("carries the visitor's id and the day, for the server to count the move towards that day's result", async () => {
    const fetchMock = answer()
    global.fetch = fetchMock
    const daily = { visitorId: '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11', day: '2026-07-02' }

    await createRemoteEngine('rugby', playerA, playerB, 'easy', { daily }).addInput({
      kind: 'easy',
      playerId: charlie.id,
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).daily).toEqual(daily)
  })

  it('sends nothing of the sort in free play', async () => {
    const fetchMock = answer()
    global.fetch = fetchMock

    await createRemoteEngine('rugby', playerA, playerB, 'easy').addInput({ kind: 'easy', playerId: charlie.id })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('daily')
  })
})
