import { useSportContext } from './SportContext'
import { translationsFor } from './translationsFor'

export type { Translations } from './en'

/** The reader's language, in the words of the page's sport (src/i18n/translationsFor.ts). */
export function useTranslations() {
  const sport = useSportContext()
  const lang = typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr' : 'en'
  return translationsFor(lang, sport)
}
