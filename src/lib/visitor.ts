/**
 * Who is visiting, without an account — browser-side only.
 *
 * Everything lives in `localStorage`, so "a visitor" is a browser on a device, not a person: a new
 * device, a private window or cleared site data all look like a first visit, and nothing
 * recognises the same person across devices. Nothing here is sent to the server.
 *
 * `playerId` is an anonymous random id, minted on the first visit. Nothing reads it yet: it is the
 * groundwork for recording daily-challenge results and a ranking, which will need to tell two
 * browsers apart without asking anyone to sign up.
 *
 * Storage can throw rather than return null — Safari in private mode, a browser set to block site
 * data. Every access is guarded, and a failure reads as a returning visitor who has seen the
 * rules: better to skip the pop-up than to reopen it on every page because the "seen" flag can
 * never be written.
 */

const PLAYER_ID_KEY = 'ipw.playerId'
const RULES_SEEN_KEY = 'ipw.rulesSeen'

/**
 * Version of the rules pop-up content. Bump it when the rules change enough that every visitor
 * should read them again: anyone who saw an older version gets the pop-up once more.
 *
 * 2 — lives in the daily challenge.
 */
export const RULES_VERSION = 2

export type Visitor = {
  /** Anonymous id of this browser, stable across visits. Empty when storage is unavailable. */
  playerId: string
  /** True only on the very first read in this browser — the id did not exist before it. */
  isFirstVisit: boolean
  /** Whether the current version of the rules has been shown and closed. */
  rulesSeen: boolean
}

const UNAVAILABLE: Visitor = { playerId: '', isFirstVisit: false, rulesSeen: true }

/**
 * A random UUID v4.
 *
 * `crypto.randomUUID` only exists in secure contexts: over plain HTTP — the dev server opened
 * from a phone on the local network — it is undefined, and the visitor would read as "storage
 * unavailable" forever. `getRandomValues` exists in every context, so it is the fallback.
 */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Reads the visitor, creating the anonymous id on the first visit. */
export function readVisitor(): Visitor {
  try {
    const storage = window.localStorage
    let playerId = storage.getItem(PLAYER_ID_KEY)
    const isFirstVisit = playerId === null
    if (playerId === null) {
      playerId = randomId()
      storage.setItem(PLAYER_ID_KEY, playerId)
    }
    const rulesSeen = Number(storage.getItem(RULES_SEEN_KEY)) >= RULES_VERSION
    return { playerId, isFirstVisit, rulesSeen }
  } catch {
    return UNAVAILABLE
  }
}

/** Records that the current version of the rules has been read. */
export function markRulesSeen(): void {
  try {
    window.localStorage.setItem(RULES_SEEN_KEY, String(RULES_VERSION))
  } catch {
    // Nothing to do: `readVisitor` already treats unavailable storage as "seen".
  }
}
