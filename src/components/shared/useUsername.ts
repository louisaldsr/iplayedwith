'use client'

import { useCallback, useEffect, useState } from 'react'
import { hasVisitorCookie, readCachedUsername, readVisitor, saveCachedUsername } from '../../lib/visitor'
import { getUsername } from '../../lib/gameApi'

/**
 * The visitor's username — the one the rankings show — for the menu badge and the game's top bar.
 * Raw: display it with `formatUsername`.
 *
 * Cached in the browser: after the first visit it is there at once, with no request. On a first
 * visit it asks the server, which creates the name — and sets the visitor cookie (`visitorCookie.ts`);
 * a cached name without that cookie is shown at once and asked again, to get it. Null until there is a name, and for good
 * without storage (no id, so no name) or when the server does not answer — the next visit asks
 * again.
 *
 * `update` is for a rename: shown at once, and cached so the next page has it too.
 */
export function useUsername(): { username: string | null; update: (username: string) => void } {
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const { playerId } = readVisitor()
    if (!playerId) return

    const cached = readCachedUsername(playerId)
    if (cached) setUsername(cached)
    // The request also sets the cookie that keeps the id through Safari's purge: asked until it is there.
    if (cached && hasVisitorCookie(playerId)) return

    const controller = new AbortController()
    getUsername(playerId, controller.signal)
      .then((fetched) => {
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
