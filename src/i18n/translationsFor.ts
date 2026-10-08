import type { SportId } from '../domain/sport'
import en, { enBySport, type DeepPartial, type SportOverrides, type Translations } from './en'
import fr, { frBySport } from './fr'

export type Lang = 'en' | 'fr'

const BASE: Record<Lang, Translations> = { en, fr }
const BY_SPORT: Record<Lang, SportOverrides> = { en: enBySport, fr: frBySport }

const cache = new Map<string, Translations>()

/**
 * The texts of a language, as a sport's pages say them: the base, with that sport's overrides
 * merged over it (`enBySport` / `frBySport`). Without a sport, or for a sport that says nothing
 * differently, the base itself.
 *
 * Pure, so the server can read it too (page metadata). Cached: the same object comes back every
 * time, which keeps it stable as a React dependency.
 */
export function translationsFor(lang: Lang, sport?: SportId | null): Translations {
  const overrides = sport ? BY_SPORT[lang][sport] : undefined
  if (!sport || !overrides) return BASE[lang]

  const key = `${lang}:${sport}`
  let merged = cache.get(key)
  if (!merged) {
    merged = mergeDeep<Translations>(BASE[lang], overrides)
    cache.set(key, merged)
  }
  return merged
}

/** Plain objects merge key by key; anything else — text, a function — replaces. */
function mergeDeep<T>(base: T, override: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) out[key] = mergeDeep((base as Record<string, unknown>)[key], value as never)
  }
  return out as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
