'use client'

import { useEffect, useState } from 'react'
import { formatVisitorName, VisitorName } from '../../domain/visitorName'
import { readCachedName, readVisitor, saveCachedName } from '../../lib/visitor'
import { getVisitorName } from '../../lib/gameApi'
import { useTranslations } from '../../i18n'

/**
 * The visitor's generated name, top left of the menu — the name the rankings show.
 *
 * Cached in the browser: after the first visit it paints at once, with no request. On a first
 * visit it asks the server, which creates the name. Nothing is shown until there is a name, and
 * nothing at all without storage (no id, so no name).
 */
export function VisitorBadge() {
  const t = useTranslations()
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
      .catch(() => {
        // No badge this time; the next visit asks again.
      })
    return () => controller.abort()
  }, [])

  if (!name) return null
  const label = formatVisitorName(name, t.visitorNames)

  return (
    <p className="visitor-badge" title={t.menu.yourName}>
      <span className="visitor-badge__icon" aria-hidden="true">
        👤
      </span>
      <span className="visually-hidden">{t.menu.yourName}: </span>
      <span className="visitor-badge__name">{label}</span>
    </p>
  )
}
