'use client'

import { useTranslations } from '../../i18n'
import { DailySolutionState } from './useDailySolution'

/**
 * "Proposed Solution", for a finished daily — a checkbox floating at the top of the board:
 * unchecked, the board is the visitor's own; checked, it steps back into the shadow and the
 * solution lights up over it. The legend comes right under it.
 */
export function SolutionOverlay({ solution }: { solution: DailySolutionState }) {
  return (
    <div className="solution-overlay">
      <SolutionToggle solution={solution} />
      <SolutionLegend solution={solution} />
    </div>
  )
}

/** The checkbox itself. */
export function SolutionToggle({ solution }: { solution: DailySolutionState }) {
  const t = useTranslations()
  const loading = solution.status === 'loading'
  return (
    <label className={`solution-toggle${loading ? ' solution-toggle--loading' : ''}`}>
      <input
        type="checkbox"
        checked={solution.shown !== null || loading}
        disabled={loading}
        onChange={(e) => (e.currentTarget.checked ? void solution.show() : solution.hide())}
      />
      <span>{t.daily.solution.toggle}</span>
    </label>
  )
}

/**
 * Under the checkbox: what the sky-blue cards and links are — ONE of the
 * shortest chains, others may exist — or why they did not come.
 */
export function SolutionLegend({ solution }: { solution: DailySolutionState }) {
  const t = useTranslations()
  const s = t.daily.solution
  if (solution.shown) {
    return (
      <p className="end-bar__legend">
        <span className="end-bar__swatch" aria-hidden="true" />
        {s.legend(solution.shown.path.length - 1)}
      </p>
    )
  }
  if (solution.status === 'error') {
    return (
      <p className="end-bar__error" role="alert">
        {s.unavailable}
      </p>
    )
  }
  return null
}
