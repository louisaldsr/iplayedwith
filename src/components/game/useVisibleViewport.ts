'use client'

import { useEffect } from 'react'

/**
 * While the game is shown: the part of the page actually visible, as `--visible-top` and
 * `--visible-height` on the root. The typing sheet (`.autocomplete-wrapper--sheet`) sits exactly
 * there: when the keyboard opens, iOS slides the visible part down the page (`offsetTop`) whatever
 * the field's place — a sheet pinned to the page's top had its field slid out of sight above.
 *
 * Also holds off Safari's pinch-zoom of the page, which `touch-action` does not stop: two fingers
 * zoom the board (`GameBoard`), never the page around it.
 */
export function useVisibleViewport(): void {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    const update = () => {
      // Zoomed in on purpose (a trackpad pinch on a computer): leave the layout alone.
      if (!viewport || viewport.scale > 1.01) return
      root.style.setProperty('--visible-top', `${viewport.offsetTop}px`)
      root.style.setProperty('--visible-height', `${viewport.height}px`)
    }
    update()
    // `resize` as the keyboard opens and closes, `scroll` as iOS slides the visible part.
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)

    const noPinch = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', noPinch)

    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      document.removeEventListener('gesturestart', noPinch)
      root.style.removeProperty('--visible-top')
      root.style.removeProperty('--visible-height')
    }
  }, [])
}
