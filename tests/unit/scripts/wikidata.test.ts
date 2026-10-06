import {
  matchPlayers,
  normalizeExternalId,
  normalizeName,
  viewWindow,
  viewsPerYear,
  type MatchCandidate,
} from '../../../scripts/common/lib/wikidata'
import { nationTierWeight } from '../../../scripts/football/lib/nationTiers'

const player = (playerId: string, externalId: string | null, name = playerId, games = 0): MatchCandidate => ({
  playerId,
  externalId,
  name,
  games,
})
const map = (entries: [string, string[]][]) => new Map(entries)

describe('normalizeName / normalizeExternalId', () => {
  it('compare names the way the game search does', () => {
    expect(normalizeName("Aurélien O'Rougerie-Dupont")).toBe('aurelienorougeriedupont')
  })

  it('compare IDs without accents or case, but keep the hyphen that tells homonyms apart', () => {
    expect(normalizeExternalId('Aurélien-Rougerie')).toBe('aurelien-rougerie')
    expect(normalizeExternalId('tom-wood-')).toBe('tom-wood-')
    expect(normalizeExternalId('tom-wood-')).not.toBe(normalizeExternalId('tom-wood'))
  })
})

describe('matchPlayers', () => {
  it('matches by external ID, exactly or without accents', () => {
    const matches = matchPlayers(
      [player('p1', 'antoine-dupont'), player('p2', 'aurelien-rougerie')],
      map([
        ['antoine-dupont', ['Q1']],
        ['aurélien-rougerie', ['Q2']],
      ]),
      new Map(),
      null,
    )
    expect(matches.get('p1')).toEqual({ qid: 'Q1', how: 'id' })
    expect(matches.get('p2')).toEqual({ qid: 'Q2', how: 'id' })
  })

  it('tells homonyms apart by their ID', () => {
    const matches = matchPlayers(
      [player('england', 'tom-wood'), player('other', 'tom-wood-')],
      map([['tom-wood', ['Q10']]]),
      new Map(),
      null,
    )
    expect(matches.get('england')).toEqual({ qid: 'Q10', how: 'id' })
    expect(matches.has('other')).toBe(false)
  })

  it('never guesses: an ID two of our players share, or two items share, matches no one', () => {
    const matches = matchPlayers(
      [player('a', 'same'), player('b', 'same'), player('c', 'twice')],
      map([
        ['same', ['Q1']],
        ['twice', ['Q2', 'Q3']],
      ]),
      new Map(),
      null,
    )
    expect(matches.size).toBe(0)
  })

  it('falls back on a unique name, only past the games threshold', () => {
    const byName = map([['Tom Wood', ['Q5']]])
    expect(matchPlayers([player('p', null, 'Tom Wood', 179)], new Map(), byName, 100).get('p')).toEqual({
      qid: 'Q5',
      how: 'unique-name',
    })
    expect(matchPlayers([player('p', null, 'Tom Wood', 12)], new Map(), byName, 100).has('p')).toBe(false)
    expect(matchPlayers([player('p', null, 'Tom Wood', 179)], new Map(), byName, null).has('p')).toBe(false)
  })

  it('refuses an ambiguous name, and an item already taken by an ID match', () => {
    const matches = matchPlayers(
      [player('byId', 'x'), player('byName', null, 'Sean O’Brien', 205), player('taken', null, 'Taken', 150)],
      map([['x', ['Q1']]]),
      map([
        ["Sean O'Brien", ['Q7', 'Q8']],
        ['Taken', ['Q1']],
      ]),
      100,
    )
    expect([...matches.keys()]).toEqual(['byId'])
  })

  it('drops an item that two players ended up on', () => {
    // Two of our players share a name and neither has an ID: both would land on the one item.
    const matches = matchPlayers(
      [player('a', null, 'Same Name', 150), player('b', null, 'Same Name', 150), player('c', 'id-c')],
      map([['id-c', ['Q1']]]),
      map([['Same Name', ['Q2']]]),
      100,
    )
    expect([...matches.keys()]).toEqual(['c'])
  })
})

describe('viewWindow', () => {
  it('covers the last 36 full months before today', () => {
    expect(viewWindow(new Date('2026-10-05T12:00:00Z'))).toEqual({
      start: '20231001',
      end: '20260930',
      label: '202310-202609',
      years: 3,
    })
  })

  it('handles a window ending in December', () => {
    expect(viewWindow(new Date('2027-01-15T00:00:00Z'), 12)).toMatchObject({ start: '20260101', end: '20261231' })
  })
})

describe('viewsPerYear', () => {
  it('sums French and English and averages over the years', () => {
    expect(
      viewsPerYear(
        new Map([
          ['fr', 600],
          ['en', 300],
        ]),
        3,
      ),
    ).toBe(300)
    expect(viewsPerYear(new Map([['en', 90]]), 3)).toBe(30)
  })

  it('reads an article with no views as 0, and no article at all as unmeasured', () => {
    expect(viewsPerYear(new Map([['fr', 0]]), 3)).toBe(0)
    expect(viewsPerYear(new Map(), 3)).toBeNull()
  })
})

describe('nationTierWeight', () => {
  it('weighs a cap by the FIFA ranking: top 10, 11-30, 31-60, the rest', () => {
    expect([1, 10, 11, 30, 31, 60, 61, 200].map(nationTierWeight)).toEqual([1, 1, 0.5, 0.5, 0.2, 0.2, 0.1, 0.1])
  })
})
