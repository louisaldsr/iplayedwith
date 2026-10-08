import { resolveMembershipRows } from '../../../scripts/common/seedSteps'
import type { SeedMembership } from '../../../scripts/common/seedDataset'
import { toSeedDataset } from '../../../scripts/football/lib/seed'
import { Season } from '@/domain/season'

const membership = (playerSourceId: string, clubSourceId: string, games: number | null = 10): SeedMembership => ({
  playerSourceId,
  clubSourceId,
  season: Season('2020-2021'),
  competition: 'League',
  games,
})

describe('resolveMembershipRows', () => {
  it('maps both source ids to the seeded UUIDs and keeps season, competition and games', () => {
    const { rows, unresolved } = resolveMembershipRows(
      [membership('p1', 'c1', 0)],
      { c1: 'club-uuid' },
      { p1: 'player-uuid' },
    )

    expect(rows).toEqual([
      { playerId: 'player-uuid', clubId: 'club-uuid', season: '2020-2021', competition: 'League', games: 0 },
    ])
    expect(unresolved.clubs.size + unresolved.players.size).toBe(0)
  })

  it('drops a row with either end unseeded and reports each missing id once', () => {
    const { rows, unresolved } = resolveMembershipRows(
      [membership('p1', 'cX'), membership('p1', 'cX'), membership('pX', 'c1'), membership('p1', 'c1')],
      { c1: 'club-uuid' },
      { p1: 'player-uuid' },
    )

    expect(rows).toHaveLength(1)
    expect([...unresolved.clubs]).toEqual(['cX'])
    expect([...unresolved.players]).toEqual(['pX'])
  })

  it('passes a NULL games count through — "the source does not say" is not 0', () => {
    const { rows } = resolveMembershipRows([membership('p1', 'c1', null)], { c1: 'c' }, { p1: 'p' })
    expect(rows[0].games).toBeNull()
  })

  it('turns a missing competition into undefined, which the upsert leaves unset', () => {
    const { rows } = resolveMembershipRows([{ ...membership('p1', 'c1'), competition: null }], { c1: 'c' }, { p1: 'p' })
    expect(rows[0].competition).toBeUndefined()
  })
})

describe('football toSeedDataset', () => {
  it('keys everything by Transfermarkt id, the key the existing seeded-id maps use', () => {
    const seed = toSeedDataset({
      generatedAt: '2026-01-01T00:00:00Z',
      clubs: [{ transfermarktId: '418', name: 'Real Madrid', logoUrl: 'https://logo/418.png' }],
      players: [
        { transfermarktId: '28003', name: 'Lionel Messi', nationality: 'AR', caps: 190, nationalTeam: 'Argentina' },
      ],
      memberships: [
        {
          playerTransfermarktId: '28003',
          clubTransfermarktId: '418',
          season: Season('2012-2013'),
          competition: 'LaLiga',
          games: 3,
          minutes: 210,
        },
      ],
      nationalTeams: [],
    })

    expect(seed.clubs).toEqual([{ sourceId: '418', name: 'Real Madrid', logoUrl: 'https://logo/418.png' }])
    expect(seed.players).toEqual([{ sourceId: '28003', name: 'Lionel Messi', nationality: 'AR' }])
    expect(seed.memberships).toEqual([
      { playerSourceId: '28003', clubSourceId: '418', season: '2012-2013', competition: 'LaLiga', games: 3 },
    ])
  })
})
