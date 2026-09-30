'use client'

import { useTranslations } from '../../i18n'

type Props = {
  left: number
  total: number
  /**
   * Increases with every life lost. It keys the heart that was just lost, so its break animation
   * replays each time instead of running only once.
   */
  lostCount: number
}

// A chubby, rounded heart — the cartoon silhouette, drawn with a thick outline.
const HEART_PATH =
  'M12 20.6C12 20.6 3.2 15 3.2 9 3.2 6.1 5.4 4 8 4c1.7 0 3.1.9 4 2.3C12.9 4.9 14.3 4 16 4c2.6 0 4.8 2.1 4.8 5 0 6-8.8 11.6-8.8 11.6z'

/**
 * Cel-shaded cartoon heart: flat colour, a darker lower half instead of a gradient, a bold dark
 * outline, and a white gleam on the upper left. An empty heart keeps the outline over a dark fill.
 */
export function Heart({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="heart__svg" aria-hidden="true">
      <path d={HEART_PATH} className={full ? 'heart__body' : 'heart__body heart__body--empty'} />
      {full && (
        <>
          <path d="M5.2 12.4c2.4 3.2 6.8 6.1 6.8 6.1s4.4-2.9 6.8-6.1z" className="heart__shade" />
          <path d="M6.4 7.2c.6-.9 1.6-1.3 2.5-1.1" className="heart__gleam" />
          <circle cx="6" cy="9.4" r=".75" className="heart__gleam-dot" />
        </>
      )}
      <path d={HEART_PATH} className="heart__outline" />
    </svg>
  )
}

/** The daily's lives, as a row of hearts at the bottom of the board. */
export function LivesBar({ left, total, lostCount }: Props) {
  const t = useTranslations()

  return (
    // Stable element: the live region inside must stay mounted for screen readers to announce it.
    // The shake replays through the breaking heart (see .lives-bar:has(.heart--breaking)).
    <div className="lives-bar">
      <div className="lives-bar__hearts" role="img" aria-label={t.daily.livesLeft(left, total)}>
        {Array.from({ length: total }, (_, i) => {
          const full = i < left
          // The heart just lost is the first empty one: it breaks, the others simply stay empty.
          const justLost = lostCount > 0 && i === left
          return (
            <span
              key={justLost ? `lost-${lostCount}` : i}
              className={`heart${full ? '' : ' heart--empty'}${justLost ? ' heart--breaking' : ''}`}
            >
              <Heart full={full} />
            </span>
          )
        })}
      </div>
      {/* Announced to screen readers when a life is lost — the flash and the hearts are visual only. */}
      <span className="visually-hidden" aria-live="polite">
        {lostCount > 0 ? t.daily.livesLeft(left, total) : ''}
      </span>
    </div>
  )
}
