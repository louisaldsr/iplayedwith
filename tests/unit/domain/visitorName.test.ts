import { formatVisitorName, NAME_ADJECTIVES, NAME_NOUNS, randomVisitorName, visitorNameOf } from '@/domain/visitorName'
import en from '@/i18n/en'
import fr from '@/i18n/fr'

describe('randomVisitorName', () => {
  it('draws from the whole of both lists', () => {
    expect(randomVisitorName(() => 0)).toEqual({ adjective: NAME_ADJECTIVES[0], noun: NAME_NOUNS[0] })
    expect(randomVisitorName(() => 0.9999)).toEqual({ adjective: NAME_ADJECTIVES.at(-1), noun: NAME_NOUNS.at(-1) })
  })
})

describe('visitorNameOf', () => {
  it('reads back a stored name', () => {
    expect(visitorNameOf('hasty', 'prop')).toEqual({ adjective: 'hasty', noun: 'prop' })
  })

  it('gives null for a missing name or a key no longer in the lists', () => {
    expect(visitorNameOf(null, null)).toBeNull()
    expect(visitorNameOf('hasty', 'hooker')).toBeNull()
  })
})

describe('formatVisitorName', () => {
  it("follows each language's word order", () => {
    const name = { adjective: 'hasty', noun: 'prop' } as const
    expect(formatVisitorName(name, en.visitorNames)).toBe('Hasty Prop')
    expect(formatVisitorName(name, fr.visitorNames)).toBe('Pilier Pressé')
  })
})

describe('the lists', () => {
  it.each([
    ['en', en.visitorNames],
    ['fr', fr.visitorNames],
  ])('have distinct labels in %s, so two keys never read the same', (_, labels) => {
    for (const words of [Object.values(labels.adjectives), Object.values(labels.nouns)]) {
      expect(new Set(words).size).toBe(words.length)
    }
  })

  it('have no duplicate keys — the stored keys must stay unambiguous', () => {
    expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length)
    expect(new Set(NAME_NOUNS).size).toBe(NAME_NOUNS.length)
  })
})
