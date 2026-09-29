import { toCareerStints } from '@/domain/career'
import { ClubId } from '@/domain/ids'
import { Season } from '@/domain/season'

const club = (id: string, name: string) => ({ id: ClubId(id), name, sport: 'rugby' as const })
const toulouse = club('c-tls', 'Stade Toulousain')
const racing = club('c-rac', 'Racing 92')

const row = (c: typeof toulouse, season: string, games: number | null = null) => ({
  club: c,
  season: Season(season),
  games,
})

describe('toCareerStints', () => {
  it('merges consecutive seasons at a club into one stint, summing the games', () => {
    const stints = toCareerStints([row(toulouse, '2016-2017', 20), row(toulouse, '2015-2016', 10)])

    expect(stints).toEqual([{ club: toulouse, from: '2015-2016', to: '2016-2017', games: 30 }])
  })

  it('splits a return to a club after a gap into two stints, oldest first', () => {
    const stints = toCareerStints([row(toulouse, '2015-2016'), row(racing, '2016-2017'), row(toulouse, '2018-2019')])

    expect(stints.map((s) => [s.club.name, s.from, s.to])).toEqual([
      ['Stade Toulousain', '2015-2016', '2015-2016'],
      ['Racing 92', '2016-2017', '2016-2017'],
      ['Stade Toulousain', '2018-2019', '2018-2019'],
    ])
  })

  it('keeps two clubs of the same season (a loan) as two stints', () => {
    const stints = toCareerStints([row(toulouse, '2015-2016'), row(racing, '2015-2016')])
    expect(stints).toHaveLength(2)
  })

  it('leaves games null only when no season of the stint has a count', () => {
    expect(toCareerStints([row(toulouse, '2015-2016'), row(toulouse, '2016-2017')])[0].games).toBeNull()
    expect(toCareerStints([row(toulouse, '2015-2016'), row(toulouse, '2016-2017', 12)])[0].games).toBe(12)
  })

  it('is empty for a player with no membership', () => {
    expect(toCareerStints([])).toEqual([])
  })
})
