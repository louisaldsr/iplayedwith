import {
  formatUsername,
  formatVisitorName,
  generatedNameOf,
  NAME_ADJECTIVES,
  NAME_NOUNS,
  randomVisitorName,
  toUsername,
  visitorNameOf,
} from '@/domain/visitorName'
import en from '@/i18n/en'
import fr from '@/i18n/fr'

describe('randomVisitorName', () => {
  it('draws from the whole of both lists and every number', () => {
    expect(randomVisitorName(() => 0)).toEqual({ adjective: NAME_ADJECTIVES[0], noun: NAME_NOUNS[0], number: 0 })
    expect(randomVisitorName(() => 0.9999)).toEqual({
      adjective: NAME_ADJECTIVES.at(-1),
      noun: NAME_NOUNS.at(-1),
      number: 999,
    })
  })
})

describe('toUsername / generatedNameOf', () => {
  it('stores the three keys in order, the number on three digits, and reads them back', () => {
    const name = { adjective: 'hasty', noun: 'prop', number: 42 } as const
    expect(toUsername(name)).toBe('hasty:prop:042')
    expect(generatedNameOf('hasty:prop:042')).toEqual(name)
  })

  it('round-trips every key', () => {
    for (const adjective of NAME_ADJECTIVES) {
      for (const noun of NAME_NOUNS) {
        const name = { adjective, noun, number: 7 }
        expect(generatedNameOf(toUsername(name))).toEqual(name)
      }
    }
  })

  // Anything that does not split into known keys is a typed username.
  it.each(['Dupont', 'hasty:prop', 'hasty:prop:42', 'hasty:hooker:042', 'hasty:prop:042:x', ''])(
    'is null for %p',
    (username) => expect(generatedNameOf(username)).toBeNull(),
  )
})

describe('formatUsername', () => {
  it("reads a generated username in the reader's language", () => {
    expect(formatUsername('hasty:prop:042', en.visitorNames)).toBe('Hasty Prop 042')
    expect(formatUsername('hasty:prop:042', fr.visitorNames)).toBe('Pilier Pressé 042')
  })

  it('shows any other username as typed', () => {
    expect(formatUsername('Dupont9', fr.visitorNames)).toBe('Dupont9')
  })
})

describe('visitorNameOf', () => {
  it('reads back a stored name', () => {
    expect(visitorNameOf('hasty', 'prop', 42)).toEqual({ adjective: 'hasty', noun: 'prop', number: 42 })
  })

  it('gives null for a missing name, a key no longer in the lists, or a number out of range', () => {
    expect(visitorNameOf(null, null, null)).toBeNull()
    expect(visitorNameOf('hasty', 'hooker', 42)).toBeNull()
    expect(visitorNameOf('hasty', 'prop', 1000)).toBeNull()
    expect(visitorNameOf('hasty', 'prop', 4.2)).toBeNull()
  })
})

describe('formatVisitorName', () => {
  it("follows each language's word order, the number on three digits", () => {
    const name = { adjective: 'hasty', noun: 'prop', number: 42 } as const
    expect(formatVisitorName(name, en.visitorNames)).toBe('Hasty Prop 042')
    expect(formatVisitorName(name, fr.visitorNames)).toBe('Pilier Pressé 042')
    expect(formatVisitorName({ ...name, number: 0 }, en.visitorNames)).toBe('Hasty Prop 000')
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
