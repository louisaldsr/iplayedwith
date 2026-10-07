import { normalizeSearch } from '@/lib/searchNormalize'

/**
 * A username typed by the visitor — the rename on the menu. A generated one (visitorName.ts) is
 * never validated here: it comes from curated lists.
 *
 * Checked by the server before it is stored, and by the dialog as the visitor types, with the same
 * function. Unique once normalized — "Dupont", "dupont" and "Dupönt" are one name — which only the
 * database can tell (020_visitor_username.sql).
 *
 * No ':' — the allowed characters exclude it. That is what keeps a typed username from ever being
 * read as a generated one (USERNAME_SEPARATOR).
 *
 * No word filter: the day's top three are shown to everyone (src/domain/dailyLeaderboard.ts), names
 * as typed. A risk accepted while traffic is low — the filter is still to come.
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20

/**
 * Latin letters (accents included), digits, spaces and . _ ' -
 *
 * Latin only because uniqueness is judged on the normalized form, which keeps a–z and 0–9: a name
 * in another script would normalize to its digits alone, and "Иван123" would clash with "123".
 */
const ALLOWED = /^[\p{Script=Latin}\p{M}0-9 ._'-]+$/u

export type UsernameProblem = 'too-short' | 'too-long' | 'characters'

export type TypedUsername = { ok: true; username: string } | { ok: false; problem: UsernameProblem }

/**
 * The username to store — trimmed, inner spaces collapsed — or what is wrong with it. Too short
 * counts letters and digits only: "a.b" is not a name.
 */
export function parseTypedUsername(raw: string): TypedUsername {
  const username = raw.trim().replace(/\s+/g, ' ')
  if (!ALLOWED.test(username)) {
    return username === '' ? { ok: false, problem: 'too-short' } : { ok: false, problem: 'characters' }
  }
  if (normalizeSearch(username).length < USERNAME_MIN_LENGTH) return { ok: false, problem: 'too-short' }
  if ([...username].length > USERNAME_MAX_LENGTH) return { ok: false, problem: 'too-long' }
  return { ok: true, username }
}

/**
 * Variants of a taken username, to offer instead: a number added, the name cut short to make room
 * ("Dupont" → "Dupont7", "Dupont42"). Distinct once normalized, all valid. The database then keeps
 * the free ones.
 */
export function usernameVariants(username: string, count = 6, random: () => number = Math.random): string[] {
  const variants = new Map<string, string>()
  for (let tries = 0; variants.size < count && tries < count * 10; tries++) {
    const suffix = String(1 + Math.floor(random() * (tries < count ? 99 : 999)))
    const base = [...username]
      .slice(0, USERNAME_MAX_LENGTH - suffix.length)
      .join('')
      .trimEnd()
    const variant = `${base}${suffix}`
    const parsed = parseTypedUsername(variant)
    if (parsed.ok) variants.set(normalizeSearch(parsed.username), parsed.username)
  }
  return [...variants.values()]
}
