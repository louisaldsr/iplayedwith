'use client'

import { formatVisitorName } from '../../domain/visitorName'
import { useTranslations } from '../../i18n'
import { useVisitorName } from '../shared/useVisitorName'

/** The visitor's generated name, top left of the menu — the name the rankings show. */
export function VisitorBadge() {
  const t = useTranslations()
  const name = useVisitorName()
  if (!name) return null

  return (
    <p className="visitor-badge" title={t.menu.yourName}>
      <span className="visitor-badge__icon" aria-hidden="true">
        👤
      </span>
      <span className="visually-hidden">{t.menu.yourName}: </span>
      <span className="visitor-badge__name">{formatVisitorName(name, t.visitorNames)}</span>
    </p>
  )
}
