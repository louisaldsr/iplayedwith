'use client'

import { FAME_FLOORS } from '../../domain/fameFloor'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
}

/** The rules and how to play. */
export function RulesDialog({ open, onClose }: Props) {
  const t = useTranslations()

  return (
    <Modal open={open} onClose={onClose} labelledBy="rules-dialog-title">
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

      <button type="button" className="btn btn--primary btn--lg" onClick={onClose}>
        {t.rules.cta}
      </button>
    </Modal>
  )
}
