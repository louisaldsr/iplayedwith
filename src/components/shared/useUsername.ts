'use client'

import { useCallback, useEffect, useState } from 'react'
import { hasVisitorCookie, readCachedUsername, readVisitor, saveCachedUsername } from '../../lib/visitor'
import { getUsername } from '../../lib/gameApi'

/** Every mounted `useUsername`, told when the name arrives from elsewhere (the first Start). */
const listeners = new Set<(username: string) => void>()

/**
 * A name the server just gave — the first Start registers the visitor and answers its name. Cached
 * for the next pages, and shown at once by every badge already on screen (the game bar mounts
 * before the Start answers).
 */
export function announceUsername(playerId: string, username: string): void {
  saveCachedUsername(playerId, username)
  for (const listener of listeners) listener(username)
}

/**
 * The visitor's username — the one the rankings show — for the menu badge and the game's top bar.
 * Raw: display it with `formatUsername`.
 *
 * A visitor has a name once it has started a daily challenge: the server registers it then, never
 * for a page view (`POST /api/:sport/daily/start`, which answers the name — `announceUsername`).
 * Before that there is nothing to ask: with neither a cached name nor the visitor cookie, no request.
 *
 * Cached in the browser: after that it is there at once, with no request. Asked of the server when
 * only one of the two is there — the cookie without the cache (storage purged, Safari), or the cache
 * without the cookie (a visitor from before the cookie: the answer sets it). Null until there is a
 * name, and for good without storage (no id, so no name) or when the server does not answer — the
 * next visit asks again.
 *
 * `update` is for a rename: shown at once, and cached so the next page has it too.
 */
export function useUsername(): { username: string | null; update: (username: string) => void } {
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    listeners.add(setUsername)
    return () => {
      listeners.delete(setUsername)
    }
  }, [])

  useEffect(() => {
    const { playerId } = readVisitor()
    if (!playerId) return

    const cached = readCachedUsername(playerId)
    if (cached) setUsername(cached)
    const hasCookie = hasVisitorCookie(playerId)
    // Both: nothing to ask. Neither: never registered — the first Start will announce the name.
    if (Boolean(cached) === hasCookie) return

    const controller = new AbortController()
    getUsername(playerId, controller.signal)
      .then((fetched) => {
        if (!fetched) return
        saveCachedUsername(playerId, fetched)
        setUsername(fetched)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const update = useCallback((renamed: string) => {
    const { playerId } = readVisitor()
    if (playerId) saveCachedUsername(playerId, renamed)
    setUsername(renamed)
  }, [])

  return { username, update }
}
