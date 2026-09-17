import { normalizeSearch, searchEquals } from '@/lib/searchNormalize'

/**
 * These cases are the contract between this module and the SQL `public.search_normalize()`
 * in supabase/migrations/008_search_normalization.sql. If one changes, the other has to.
 * The expected values below can be replayed in the SQL editor as-is:
 *
 *   SELECT public.search_normalize('Gaël Fickou');  -- → gaelfickou
 */
const PARITY_CASES: [input: string, expected: string][] = [
  // Combining diacritics — NFD decomposes these.
  ['Gaël Fickou', 'gaelfickou'],
  ['Étienne Falgoux', 'etiennefalgoux'],
  ['Müller', 'muller'],
  ['Håland', 'haland'],
  ['Nuñez', 'nunez'],

  // Standalone letters NFD does NOT decompose — these need the explicit fold table.
  ['Ødegaard', 'odegaard'],
  ['Łukasz', 'lukasz'],
  ['Weiß', 'weiss'],
  ['Æthel', 'aethel'],
  ['Mœurs', 'moeurs'],
  ['Đorđević', 'dordevic'],

  // Punctuation is dropped, not collapsed — this is what the whole design turns on.
  ["O'Connor", 'oconnor'],
  ['AS Saint-Étienne', 'assaintetienne'],
  ['Mont-de-Marsan', 'montdemarsan'],
  ['Union Bordeaux-Bègles', 'unionbordeauxbegles'],

  // Whitespace of any shape or amount.
  ['  Stade   Rochelais  ', 'staderochelais'],
  ['Racing 92', 'racing92'],

  // Nothing left to compare on.
  ['', ''],
  ['---', ''],
]

describe('normalizeSearch', () => {
  it.each(PARITY_CASES)('normalizes %j to %j', (input, expected) => {
    expect(normalizeSearch(input)).toBe(expected)
  })

  // The three spellings a player might type for one club must land on one string, which is
  // the reason separators are removed rather than turned into a space.
  it('collapses every spelling of a separated name to the same form', () => {
    const forms = ['Saint-Étienne', 'Saint Etienne', 'saintetienne', 'SAINT  ETIENNE']
    expect(new Set(forms.map(normalizeSearch)).size).toBe(1)
  })

  // ILIKE wildcards used to reach the query untouched; normalization strips them.
  it('strips SQL wildcards out of a query', () => {
    expect(normalizeSearch('%_%')).toBe('')
    expect(normalizeSearch('dup%ont')).toBe('dupont')
  })
})

describe('searchEquals', () => {
  it('matches across accents and punctuation', () => {
    expect(searchEquals('Gaël Fickou', 'gael fickou')).toBe(true)
    expect(searchEquals("O'Connor", 'oconnor')).toBe(true)
  })

  it('does not match different names', () => {
    expect(searchEquals('Gaël Fickou', 'Gaël Fickoux')).toBe(false)
  })

  // The alias arm of the club comparison passes `undefined` whenever the official name is
  // what matched, and an absent alias must never count as a match.
  it('is false when either side is missing', () => {
    expect(searchEquals(undefined, 'la rochelle')).toBe(false)
    expect(searchEquals('La Rochelle', undefined)).toBe(false)
    expect(searchEquals('', '')).toBe(false)
  })
})
