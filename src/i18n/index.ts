import en from './en'
import fr from './fr'

export type { Translations } from './en'

export function useTranslations() {
  const lang =
    typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr' : 'en'
  return lang === 'fr' ? fr : en
}
