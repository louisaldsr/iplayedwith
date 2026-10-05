import { parseTypedUsername, usernameVariants, USERNAME_MAX_LENGTH } from '@/domain/username'
import { generatedNameOf } from '@/domain/visitorName'
import { normalizeSearch } from '@/lib/searchNormalize'

describe('parseTypedUsername', () => {
  it('keeps a valid name, trimmed and with single spaces', () => {
    expect(parseTypedUsername('  Jean   Dupont ')).toEqual({ ok: true, username: 'Jean Dupont' })
    expect(parseTypedUsername("Gaël O'Connor-2")).toEqual({ ok: true, username: "Gaël O'Connor-2" })
    expect(parseTypedUsername('le_9.du_XV')).toEqual({ ok: true, username: 'le_9.du_XV' })
  })

  it.each([
    ['', 'too-short'],
    ['   ', 'too-short'],
    ['ab', 'too-short'],
    // Punctuation is not a name: three letters or digits at least.
    ['a.b', 'too-short'],
    ['_-_', 'too-short'],
    ['x'.repeat(USERNAME_MAX_LENGTH + 1), 'too-long'],
    // ':' is what marks a generated name — never in a typed one.
    ['hasty:prop:042', 'characters'],
    ['Dupont!', 'characters'],
    ['Dupont 🏉', 'characters'],
    ['Иван123', 'characters'],
    ['<script>', 'characters'],
  ])('refuses %p (%s)', (raw, problem) => {
    expect(parseTypedUsername(raw)).toEqual({ ok: false, problem })
  })

  it('accepts exactly the maximum length', () => {
    expect(parseTypedUsername('x'.repeat(USERNAME_MAX_LENGTH)).ok).toBe(true)
  })

  it('never lets a typed name read as a generated one', () => {
    for (const raw of ['hasty prop 042', 'hastyprop042', 'Hasty Prop 042']) {
      const parsed = parseTypedUsername(raw)
      expect(parsed.ok && generatedNameOf(parsed.username)).toBeNull()
    }
  })
})

describe('usernameVariants', () => {
  it('adds a number to the name', () => {
    const variants = usernameVariants('Dupont', 3, () => 0.06)
    expect(variants[0]).toBe('Dupont6')
  })

  it('gives distinct, valid variants — distinct once normalized', () => {
    const variants = usernameVariants('Dupont', 6)
    expect(variants).toHaveLength(6)
    expect(new Set(variants.map(normalizeSearch)).size).toBe(6)
    for (const v of variants) expect(parseTypedUsername(v)).toEqual({ ok: true, username: v })
  })

  it('cuts a long name short to make room for the number', () => {
    const long = 'x'.repeat(USERNAME_MAX_LENGTH)
    for (const v of usernameVariants(long, 4)) {
      expect([...v].length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH)
      expect(v).toMatch(/^x+\d+$/)
    }
  })

  it('does not end the base on a space before the number', () => {
    const name = 'Jean Dupont Du Stade' // 20 characters: the cut lands just after a space
    for (const v of usernameVariants(name, 4)) expect(v).not.toMatch(/ \d+$/)
  })
})
