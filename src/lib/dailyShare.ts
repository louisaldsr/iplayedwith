import type { Translations } from '@/i18n'
import { SportId } from '@/domain/sport'
import { PlayerId } from '@/domain/ids'
import { formatScore } from '@/domain/dailyScore'
import { formatTime } from './formatTime'
import { SITE_URL } from './siteUrl'

/**
 * The message a finished daily is shared with — built in the browser from the board it holds,
 * nothing stored for it:
 *
 *   I Played With · Rugby #412
 *   Antoine Dupont → Siya Kolisi
 *   🟩⬜🟩⬜
 *   +2 · ❤️❤️🤍 · 4:37
 *   2 players more than the shortest chain
 *   iplayedwith.com/rugby/412
 *
 * It never spoils the day: the pair is public from the intro on, the players added are squares —
 * 🟩 on the winning chain, ⬜ a dead end, in the order they were added. A lost day has no chain, so
 * every square is a dead end. The link names the day (`/rugby/412`): messaging apps cache a preview
 * per URL, and that page's card is the day's.
 */

export const ON_CHAIN = '🟩'
export const DEAD_END = '⬜'
const HEART = '❤️'
const EMPTY_HEART = '🤍'

export type DailyShare = {
  sport: SportId
  number: number
  playerA: { id: PlayerId; name: string }
  playerB: { id: PlayerId; name: string }
  /** The players added to the board, in the order they were added. */
  added: PlayerId[]
  lives: { left: number; total: number }
} & (
  | {
      outcome: 'won'
      /** The winning chain, A to B. */
      path: PlayerId[]
      /** The extra players — see `dailyScore`. */
      score: number
      elapsedMs: number
    }
  | { outcome: 'lost' }
)

/** One square per player added: on the winning chain or not. */
export function shareSquares(added: PlayerId[], path: PlayerId[]): string {
  const chain = new Set<string>(path)
  return added.map((id) => (chain.has(id) ? ON_CHAIN : DEAD_END)).join('')
}

/** The day's own page, as the message shows it: no protocol, every messaging app links it anyway. */
export function dailyShareUrl(sport: SportId, number: number): string {
  return `${SITE_URL.replace(/^https?:\/\//, '')}/${sport}/${number}`
}

export function dailyShareText(share: DailyShare, t: Translations): string {
  const hearts = HEART.repeat(share.lives.left) + EMPTY_HEART.repeat(share.lives.total - share.lives.left)
  const won = share.outcome === 'won'
  const squares = shareSquares(share.added, won ? share.path : [])

  const lines = [
    t.daily.share.title(t.home.sports[share.sport], share.number),
    `${share.playerA.name} → ${share.playerB.name}`,
    // A day lost before adding anyone has no squares to show.
    ...(squares ? [squares] : []),
    ...(won
      ? [
          `${formatScore(share.score, t.daily.perfect)} · ${hearts} · ${formatTime(share.elapsedMs)}`,
          t.daily.scoreHint(share.score),
        ]
      : [`💔 ${t.daily.lostTitle} · ${hearts}`, t.daily.share.dare]),
    dailyShareUrl(share.sport, share.number),
  ]
  return lines.join('\n')
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Hands the message on: the phone's share sheet (WhatsApp, Messages… in one tap), or the clipboard
 * on a computer — where the share sheet, when the browser has one, lists few of the apps people
 * actually send from.
 */
export async function shareMessage(text: string): Promise<ShareOutcome> {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (err) {
      // Closing the share sheet is not a failure; anything else falls back to the clipboard.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      // Refused (no permission, the tap's gesture spent): the older way may still work.
    }
  }
  return copyWithSelection(text) ? 'copied' : 'failed'
}

/**
 * The clipboard before its API: select the text, then the browser's own copy command. The API only
 * exists on HTTPS pages — a phone testing the dev server over the local network has neither it nor
 * the share sheet. The text is put inside the open dialog, if any: a modal dialog makes the rest of
 * the page inert, and nothing outside it can be selected.
 */
function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const host = document.querySelector('dialog[open]') ?? document.body
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  // Off screen, and at 16px: iOS zooms into a smaller field it focuses.
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px'
  host.appendChild(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
