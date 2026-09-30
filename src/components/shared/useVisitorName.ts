'use client'

import { useEffect, useState } from 'react'
import { VisitorName } from '../../domain/visitorName'
import { readCachedName, readVisitor, saveCachedName } from '../../lib/visitor'
import { getVisitorName } from '../../lib/gameApi'

/**
 * The visitor's generated name — the one the rankings show — for the menu badge and the game's top
 * bar.
 *
 * Cached in the browser: after the first visit it is there at once, with no request. On a first
 * visit it asks the server, which creates the name. Null until there is a name, and for good
 * without storage (no id, so no name) or when the server does not answer — the next visit asks
 * again.
 */
export function useVisitorName(): VisitorName | null {
  const [name, setName] = useState<VisitorName | null>(null)

  useEffect(() => {
    const { playerId } = readVisitor()
    if (!playerId) return

    const cached = readCachedName(playerId)
    if (cached) {
      setName(cached)
      return
    }

    const controller = new AbortController()
    getVisitorName(playerId, controller.signal)
      .then((fetched) => {
        saveCachedName(playerId, fetched)
        setName(fetched)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return name
}
