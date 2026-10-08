import { isDrawnLogo, isLogo, logoFileName, logoFileOf, publicLogoUrl } from '../../../scripts/formula1/lib/logos'

describe('logoFileOf', () => {
  it('reads the file of an infobox logo, linked or bare', () => {
    expect(logoFileOf('{{Infobox F1 team\n| Logo = Scuderia Ferrari HP logo 24.svg\n')).toBe(
      'Scuderia Ferrari HP logo 24.svg',
    )
    expect(logoFileOf('| Logo          = [[File:TeamLotus.jpg|200px]]')).toBe('TeamLotus.jpg')
    expect(logoFileOf('| logo = [[Image:Maserati logo 2.svg|frameless|class=skin-invert]]')).toBe('Maserati logo 2.svg')
    expect(logoFileOf('| logo = File:Cooper car company.png')).toBe('Cooper car company.png')
  })

  it('takes the first logo line — the team infobox, not a later constructor box', () => {
    expect(logoFileOf('| Logo = First.svg\n| logo          =\n| logo = Second.svg')).toBe('First.svg')
  })

  it('finds nothing in an infobox without a logo, an empty field, or a value that is no file', () => {
    expect(logoFileOf('| image = Maserati Modène 0002.JPG')).toBeNull()
    expect(logoFileOf('| logo          =\n| image = Car.jpg')).toBeNull()
    expect(logoFileOf('| logo = {{some template}}')).toBeNull()
  })
})

describe('isDrawnLogo', () => {
  it('takes SVG and PNG from Wikidata, not a photograph', () => {
    expect(isDrawnLogo('Veritas logo.png')).toBe(true)
    expect(isDrawnLogo('Brawn GP logo.svg')).toBe(true)
    expect(isDrawnLogo('Alta engine.jpg')).toBe(false)
  })
})

describe('isLogo', () => {
  it('turns down the infobox files reviewed as photographs', () => {
    expect(isLogo('Hector Rebaque Lotus 78.jpg')).toBe(false)
    expect(isLogo('TeamLotus.jpg')).toBe(true)
  })
})

describe('logoFileName', () => {
  it('names the cleaned file after the article, accents and punctuation folded', () => {
    expect(logoFileName('Team Lotus')).toBe('team-lotus.png')
    expect(logoFileName('Écurie Nationale Belge')).toBe('ecurie-nationale-belge.png')
    expect(logoFileName('Scarab (constructor)')).toBe('scarab-constructor.png')
    expect(publicLogoUrl('team-lotus.png')).toBe('/logos/formula1/team-lotus.png')
  })
})
