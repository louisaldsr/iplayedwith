import en from '@/i18n/en'
import fr from '@/i18n/fr'
import { translationsFor } from '@/i18n/translationsFor'

describe('translationsFor', () => {
  it('is the base language without a sport, or for a sport that says nothing differently', () => {
    expect(translationsFor('en')).toBe(en)
    expect(translationsFor('fr', null)).toBe(fr)
    expect(translationsFor('en', 'rugby')).toBe(en)
  })

  it("speaks Formula 1's words on its pages — whole sentences, per language", () => {
    const enF1 = translationsFor('en', 'formula1')
    expect(enF1.game.playerPlaceholder).toBe('Driver…')
    expect(enF1.game.clubPlaceholder).toBe('Constructor…')
    expect(enF1.game.rejections['not-connected']).toBe('No constructor and season in common with anyone on the board.')
    expect(enF1.daily.scoreHint(2)).toBe('2 drivers more than the best solution')

    const frF1 = translationsFor('fr', 'formula1')
    expect(frF1.game.clubPlaceholder).toBe('Écurie…')
    expect(frF1.game.rejections['not-connected']).toBe(
      'Aucune écurie ni aucune saison en commun avec les pilotes du plateau.',
    )
    expect(frF1.daily.playersBetween(1)).toBe('pilote entre les deux')
  })

  it('keeps every string the sport does not override, siblings included', () => {
    const enF1 = translationsFor('en', 'formula1')
    expect(enF1.game.rejections['already-on-board']).toBe(en.game.rejections['already-on-board'])
    expect(enF1.daily.more.archiveHint).toBe(en.daily.more.archiveHint)
    expect(enF1.menu).toBe(en.menu)
    // The game's own players (visitors) are not drivers.
    expect(enF1.daily.ranking).toEqual(en.daily.ranking)
  })

  it('never changes the base it merges over', () => {
    translationsFor('en', 'formula1')
    expect(en.game.playerPlaceholder).toBe('Player…')
    expect(translationsFor('en', 'basketball').game.playerPlaceholder).toBe('Player…')
  })

  it('returns the same object every time — a stable React dependency', () => {
    expect(translationsFor('fr', 'formula1')).toBe(translationsFor('fr', 'formula1'))
  })
})
