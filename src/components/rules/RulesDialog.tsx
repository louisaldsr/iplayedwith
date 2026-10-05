'use client'

import { FAME_FLOORS } from '../../domain/fameFloor'
import { useTranslations } from '../../i18n'
import { Heart } from '../game/LivesBar'
import { Modal } from '../shared/Modal'
import { RulesDemo } from './RulesDemo'

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * The rules and how to play. Shown, not told: players skipped the wall of text, so the demo carries
 * the rule itself, and what is left are one-liners for what a single game cannot show.
 */
export function RulesDialog({ open, onClose }: Props) {
  const t = useTranslations()

  return (
    <Modal open={open} onClose={onClose} labelledBy="rules-dialog-title" className="rules-dialog">
      <h2 id="rules-dialog-title" className="rules-dialog__title">
        {t.rules.title}
      </h2>

      <RulesDemo active={open} />

      <ul className="rules-dialog__notes">
        <li>
          <span className="rules-dialog__icon rules-dialog__icon--heart" aria-hidden="true">
            <Heart full />
          </span>
          <p>
            <strong>{t.rules.notes.dailyTitle}</strong> — {t.rules.notes.daily}
          </p>
        </li>
        <li>
          <span className="rules-dialog__icon" aria-hidden="true">
            🔍
          </span>
          <p>
            <strong>{t.rules.notes.stuckTitle}</strong> {t.rules.notes.stuck}
          </p>
        </li>
        <li>
          <span className="rules-dialog__icon" aria-hidden="true">
            ✦
          </span>
          <p>
            <span className="rules-dialog__floors">
              {FAME_FLOORS.map(({ key }) => (
                <span key={key} className={`fame-badge fame-badge--${key}`}>
                  {t.fame.floors[key]}
                </span>
              ))}
            </span>{' '}
            {t.rules.notes.fame}
          </p>
        </li>
        <li>
          <span className="rules-dialog__icon" aria-hidden="true">
            🎲
          </span>
          <p>
            <strong>{t.rules.notes.freePlayTitle}</strong> — {t.rules.notes.freePlay}
          </p>
        </li>
      </ul>

      <button type="button" className="btn btn--primary btn--lg" onClick={onClose}>
        {t.rules.cta}
      </button>
    </Modal>
  )
}
