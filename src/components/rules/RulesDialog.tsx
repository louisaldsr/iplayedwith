'use client'

import { MouseEvent, useEffect, useRef } from 'react'
import { FAME_FLOORS } from '../../domain/fameFloor'
import { useTranslations } from '../../i18n'

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * The rules and how to play.
 *
 * A native `<dialog>` opened with `showModal()`: focus is trapped inside, Escape closes it, the
 * page behind is inert and the backdrop comes from `::backdrop` — no dependency needed. Every way
 * of closing it (button, Escape, a click on the backdrop) goes through the `close` event, so
 * `onClose` runs exactly once.
 */
export function RulesDialog({ open, onClose }: Props) {
  const t = useTranslations()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // The body fills the <dialog> (it has no padding of its own), so a click whose target is the
  // <dialog> element itself landed on the backdrop around it.
  const handleClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) e.currentTarget.close()
  }

  return (
    <dialog
      ref={ref}
      className="rules-dialog"
      aria-labelledby="rules-dialog-title"
      onClose={onClose}
      onClick={handleClick}
    >
      <div className="rules-dialog__body">
        <h2 id="rules-dialog-title" className="rules-dialog__title">
          {t.rules.title}
        </h2>

        <section className="rules-dialog__section">
          <h3>{t.rules.goalTitle}</h3>
          <p>{t.rules.goal}</p>
        </section>

        <section className="rules-dialog__section">
          <h3>{t.rules.howTitle}</h3>
          <p>{t.rules.how}</p>
          <ul>
            <li>
              <strong>{t.setup.easy}</strong> — {t.rules.easy}
            </li>
            <li>
              <strong>{t.setup.hard}</strong> — {t.rules.hard}
            </li>
          </ul>
        </section>

        <section className="rules-dialog__section">
          <h3>{t.rules.dailyTitle}</h3>
          <p>{t.rules.daily}</p>
          <p>{t.rules.freePlay}</p>
        </section>

        <section className="rules-dialog__section">
          <h3>{t.rules.cardsTitle}</h3>
          <p>{t.rules.cards}</p>
          <div className="rules-dialog__floors">
            {FAME_FLOORS.map(({ key }) => (
              <span key={key} className={`fame-badge fame-badge--${key}`}>
                {t.fame.floors[key]}
              </span>
            ))}
          </div>
        </section>

        <button type="button" className="btn btn--primary btn--lg" onClick={() => ref.current?.close()}>
          {t.rules.cta}
        </button>
      </div>
    </dialog>
  )
}
