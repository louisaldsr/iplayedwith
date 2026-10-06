'use client'

import { useTranslations } from '../../i18n'
import { DailySolutionState } from './useDailySolution'

/**
 * "Proposed Solution", for a finished daily — a switch floating at the top of the board: off, the
 * board is the visitor's own; on, it steps back into the shadow and the solution lights up over it.
 * Under it, only when the solution could not be loaded, why.
 */
export function SolutionOverlay({ solution }: { solution: DailySolutionState }) {
  const t = useTranslations()
  const loading = solution.status === 'loading'
  const on = solution.shown !== null || loading
  return (
    <div className="solution-overlay">
      <label
        className={`solution-switch${on ? ' solution-switch--on' : ''}${loading ? ' solution-switch--loading' : ''}`}
      >
        {/* A real checkbox, for the keyboard and screen readers — drawn as a switch. */}
        <input
          type="checkbox"
          role="switch"
          className="solution-switch__input"
          checked={on}
          disabled={loading}
          onChange={(e) => (e.currentTarget.checked ? void solution.show() : solution.hide())}
        />
        <span className="solution-switch__track" aria-hidden="true">
          <span className="solution-switch__thumb" />
        </span>
        <span className="solution-switch__label">{t.daily.solution.toggle}</span>
      </label>
      {solution.status === 'error' && (
        <p className="solution-overlay__error" role="alert">
          {t.daily.solution.unavailable}
        </p>
      )}
    </div>
  )
}
