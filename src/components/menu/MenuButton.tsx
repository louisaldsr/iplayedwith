'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from '../../i18n'

/**
 * The way back to the main menu, from every page but the menu itself.
 *
 * Deliberately small: during a game the board keeps the whole screen, and this sits in the game
 * top bar's left corner, which reserves room for it (see .game-topbar). Mirrors the rules "?"
 * button on the right. Not in the back-office, which has its own navigation.
 */
export function MenuButton() {
  const t = useTranslations()
  const pathname = usePathname()
  if (pathname === '/' || pathname?.startsWith('/admin')) return null

  return (
    // aria-label, because the text label is hidden on phones to leave the game top bar its room.
    <Link href="/" className="menu-button" aria-label={t.menu.button}>
      <span className="menu-button__icon" aria-hidden="true">
        ☰
      </span>
      <span className="menu-button__label">{t.menu.button}</span>
    </Link>
  )
}
