import { linksOfChain } from '@/domain/dailySolution'
import { ClubId, PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'

const m = (player: string, club: string, season: string) => ({
  playerId: PlayerId(player),
  clubId: ClubId(club),
  season: season as Season,
})
const chain = ['messi', 'neymar', 'cavani'].map(PlayerId)

describe('linksOfChain', () => {
  it('finds the club and season each consecutive pair shared', () => {
    const memberships = [
      m('messi', 'barca', '2013-2014'),
      m('neymar', 'barca', '2013-2014'),
      m('neymar', 'psg', '2017-2018'),
      m('cavani', 'psg', '2017-2018'),
    ]
    expect(linksOfChain(chain, memberships)).toEqual([
      { clubId: 'barca', season: '2013-2014' },
      { clubId: 'psg', season: '2017-2018' },
    ])
  })

  it('picks the most recent season when a pair shared several — the club id breaking a tie', () => {
    const memberships = [
      m('messi', 'barca', '2013-2014'),
      m('messi', 'barca', '2016-2017'),
      m('messi', 'argentina', '2016-2017'),
      m('neymar', 'barca', '2013-2014'),
      m('neymar', 'barca', '2016-2017'),
      m('neymar', 'argentina', '2016-2017'),
    ]
    expect(linksOfChain(chain.slice(0, 2), memberships)).toEqual([{ clubId: 'argentina', season: '2016-2017' }])
  })

  it('is null when a pair shares nothing any more', () => {
    expect(
      linksOfChain(chain.slice(0, 2), [m('messi', 'barca', '2013-2014'), m('neymar', 'psg', '2017-2018')]),
    ).toBeNull()
  })
})
