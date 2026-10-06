'use client'

import { useTranslations } from '../../i18n'
import { DailySolutionState } from './useDailySolution'

/**
 * "Show / Hide the proposed solution", for a finished daily: the button, and under it what the
 * sky-blue cards and links are — or why they did not come. The legend says it plainly: ONE of the
 * shortest chains, others may exist.
 */
export function SolutionToggle({ solution, onShow }: { solution: DailySolutionState; onShow?: () => void }) {
  const t = useTranslations()
  const s = t.daily.solution
  const shown = solution.shown !== null
  return (
    <>
      <button
        type="button"
        className={`btn ${shown ? 'btn--ghost' : 'btn--solution'}`}
        onClick={shown ? solution.hide : (onShow ?? solution.show)}
        disabled={solution.status === 'loading'}
        aria-pressed={shown}
      >
        {shown ? s.hide : s.show}
      </button>
      {solution.shown ? (
        <p className="end-bar__legend">
          <span className="end-bar__swatch" aria-hidden="true" />
          {s.legend(solution.shown.path.length - 1)}
        </p>
      ) : solution.status === 'error' ? (
        <p className="end-bar__error" role="alert">
          {s.unavailable}
        </p>
      ) : null}
    </>
  )
}
