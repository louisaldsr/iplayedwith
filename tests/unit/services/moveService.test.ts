import { applyMove, type GraphState, type MoveRequest } from '@/services/moveService'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import { PlayerId, ClubId } from '@/domain/ids'
import { Season } from '@/domain/season'
import { players, clubs, memberships } from '../../fixtures/mockData'

jest.mock('@/repositories/membershipsRepository')
jest.mock('@/repositories/playersRepository')
jest.mock('@/repositories/clubsRepository')

const db = {} as never
const mockedMemberships = jest.mocked(membershipsRepo)
const mockedPlayers = jest.mocked(playersRepo)
const mockedClubs = jest.mocked(clubsRepo)

const playerById = (id: string) => players.find((p) => p.id === id)!
const clubById = (id: string) => clubs.find((c) => c.id === id)!

beforeEach(() => {
  // The repo returns only the memberships of the players it was asked about — the whole
  // point of the query. Slicing the fixture the same way keeps the test honest about what
  // the service is actually given.
  mockedMemberships.listForPlayers.mockImplementation(async (_db, _sport, ids) =>
    memberships.filter((m) => ids.includes(m.playerId)),
  )
  mockedPlayers.findById.mockImplementation(async (_db, id) => playerById(id) ?? null)
  mockedClubs.findById.mockImplementation(async (_db, id) => clubById(id) ?? null)
  mockedClubs.findManyByIds.mockImplementation(async (_db, ids) => clubs.filter((c) => ids.includes(c.id)))
})

afterEach(() => jest.clearAllMocks())

/** A fresh graph holding just playerA and playerB, as `createRemoteEngine` starts one. */
function newGraph(playerAId: string, playerBId: string): GraphState {
  return { players: [playerAId, playerBId], clubs: [], edges: [] }
}

function request(over: Partial<MoveRequest> & Pick<MoveRequest, 'move'>): MoveRequest {
  return {
    playerAId: 'p01',
    playerBId: 'p04',
    difficulty: 'easy',
    graph: newGraph('p01', 'p04'),
    ...over,
  }
}

describe('applyMove — easy mode', () => {
  it('accepts a player sharing a club-season with someone already in the graph', async () => {
    // p01 and p02 both played Stade Toulousain 2022-2023.
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p07',
        graph: newGraph('p01', 'p07'),
        move: { kind: 'easy', playerId: PlayerId('p02') },
      }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.node).toEqual({ kind: 'player', player: playerById('p02') })
      expect(result.edges.length).toBeGreaterThan(0)
    }
  })

  it('only queries memberships for the graph plus the submitted player', async () => {
    await applyMove(db, 'rugby', request({ move: { kind: 'easy', playerId: PlayerId('p02') } }))

    expect(mockedMemberships.listForPlayers).toHaveBeenCalledTimes(1)
    const [, , ids] = mockedMemberships.listForPlayers.mock.calls[0]
    expect([...ids].sort()).toEqual(['p01', 'p02', 'p04'])
  })

  it('rejects a player with no shared club-season', async () => {
    // p11 is Toulon only; p01 (Toulouse) and p07 (Bordeaux) never played there.
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p07',
        graph: newGraph('p01', 'p07'),
        move: { kind: 'easy', playerId: PlayerId('p11') },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/ne partage aucun club/)
  })

  it('rejects a player already in the graph', async () => {
    const result = await applyMove(
      db,
      'rugby',
      request({
        move: { kind: 'easy', playerId: PlayerId('p01') },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/déjà dans le graphe/)
  })

  it('reports victory and the path once A and B are connected', async () => {
    // p01 and p02 share Toulouse 2022-2023; p03 does too, bridging them.
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p02',
        graph: newGraph('p01', 'p02'),
        move: { kind: 'easy', playerId: PlayerId('p03') },
      }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.victory).toBe(true)
      expect(result.path[0]).toBe('p01')
      expect(result.path[result.path.length - 1]).toBe('p02')
    }
  })
})

describe('applyMove — hard mode', () => {
  it('accepts a club-season an existing player played at', async () => {
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p07',
        difficulty: 'hard',
        graph: newGraph('p01', 'p07'),
        move: { kind: 'hard-club', clubId: ClubId('stade-toulousain'), season: Season('2022-2023') },
      }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.node).toEqual({
        kind: 'club',
        club: clubById('stade-toulousain'),
        season: '2022-2023',
      })
    }
  })

  it('rejects a club-season no player in the graph played at', async () => {
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p07',
        difficulty: 'hard',
        graph: newGraph('p01', 'p07'),
        move: { kind: 'hard-club', clubId: ClubId('vannes'), season: Season('2022-2023') },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Aucun joueur du graphe/)
  })

  it('rejects a player not attached to any club-season on the board', async () => {
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p07',
        difficulty: 'hard',
        graph: newGraph('p01', 'p07'),
        move: { kind: 'hard-player', playerId: PlayerId('p02') },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/ne joue dans aucun club/)
  })
})

describe('applyMove — the submitted graph is untrusted', () => {
  it('rejects an edge that matches no membership', async () => {
    // A forged edge is the only way a client could fabricate a connection, so it must not
    // be taken on trust: p01 never played for Vannes.
    const forged: GraphState = {
      players: ['p01', 'p07'],
      clubs: [],
      edges: [{ playerId: 'p01', clubId: 'vannes', season: '2022-2023' }],
    }

    await expect(
      applyMove(
        db,
        'rugby',
        request({
          playerAId: 'p01',
          playerBId: 'p07',
          graph: forged,
          move: { kind: 'easy', playerId: PlayerId('p02') },
        }),
      ),
    ).rejects.toThrow(/does not match any membership/)
  })

  it('rejects a graph missing playerA or playerB', async () => {
    await expect(
      applyMove(
        db,
        'rugby',
        request({
          graph: { players: ['p01'], clubs: [], edges: [] },
          move: { kind: 'easy', playerId: PlayerId('p02') },
        }),
      ),
    ).rejects.toThrow(/must contain both playerA and playerB/)
  })

  it('rejects a hard-mode move submitted into an easy game', async () => {
    // Easy mode's rule is stricter, so accepting a hard move here would sidestep it.
    const result = await applyMove(
      db,
      'rugby',
      request({
        difficulty: 'easy',
        move: { kind: 'hard-club', clubId: ClubId('stade-toulousain'), season: Season('2022-2023') },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/réservé au mode difficile/)
  })

  it('refuses further moves once the game is already won', async () => {
    // p01 and p02 already linked through Toulouse 2022-2023.
    const won: GraphState = {
      players: ['p01', 'p02'],
      clubs: [],
      edges: [
        { playerId: 'p01', clubId: 'stade-toulousain', season: '2022-2023' },
        { playerId: 'p02', clubId: 'stade-toulousain', season: '2022-2023' },
      ],
    }

    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p02',
        graph: won,
        move: { kind: 'easy', playerId: PlayerId('p03') },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/déjà terminée/)
  })
})

describe('applyMove — resolved node', () => {
  it('rejects a player from another sport', async () => {
    mockedPlayers.findById.mockResolvedValue({ ...playerById('p02'), sport: 'football' })

    await expect(
      applyMove(
        db,
        'rugby',
        request({
          playerAId: 'p01',
          playerBId: 'p07',
          graph: newGraph('p01', 'p07'),
          move: { kind: 'easy', playerId: PlayerId('p02') },
        }),
      ),
    ).rejects.toThrow(/does not play rugby/)
  })
})

describe('applyMove — clubs behind the new edges', () => {
  // Easy mode adds no club node, but the board names the (club, season) an edge stands for
  // when it is opened. If the move does not carry the club back, the client only has an id.
  it('returns the clubs of the edges an easy move added', async () => {
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p07',
        graph: newGraph('p01', 'p07'),
        move: { kind: 'easy', playerId: PlayerId('p02') },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const returned = new Set(result.clubs.map((c) => c.id))
    for (const edge of result.edges) {
      expect(returned.has(edge.clubId)).toBe(true)
    }
    expect(result.clubs.every((c) => c.name.length > 0)).toBe(true)
  })

  it('returns the club of the edges a hard move added', async () => {
    const result = await applyMove(
      db,
      'rugby',
      request({
        playerAId: 'p01',
        playerBId: 'p07',
        difficulty: 'hard',
        graph: newGraph('p01', 'p07'),
        move: { kind: 'hard-club', clubId: ClubId('stade-toulousain'), season: Season('2022-2023') },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const returned = new Set(result.clubs.map((c) => c.id))
    for (const edge of result.edges) {
      expect(returned.has(edge.clubId)).toBe(true)
    }
  })
})
