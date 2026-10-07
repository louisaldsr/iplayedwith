'use client'

import Link from 'next/link'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { DailyStats } from './DailyStats'
import { DailyRanking } from './DailyRanking'

type Props = {
  open: boolean
  /** Closing leaves the lost board on screen — the pop-up never navigates away. */
  onClose: () => void
  challenge: DailyChallenge
  /** Closes the results and lays the proposed solution over the board. */
  onShowSolution: () => void
}

/**
 * The results of a lost daily, over the board — the defeat's twin of `VictoryDialog`. It opens on
 * the last life lost and leads to the proposed solution: the chain that was missed, shown on the
 * visitor's own board.
 */
export function DefeatDialog({ open, onClose, challenge, onShowSolution }: Props) {
  const t = useTranslations()
  return (
    <Modal open={open} onClose={onClose} labelledBy="defeat-title" className="victory-dialog defeat-dialog">
      <span className="victory-dialog__trophy" aria-hidden="true">
        💔
      </span>
      <h2 id="defeat-title" className="defeat-dialog__heading">
        {t.daily.lostTitle}
      </h2>
      <p className="defeat-dialog__text">{t.daily.lostText(challenge.optimalLinks)}</p>

      <DailyRanking sport={challenge.sport} />
      <DailyStats sport={challenge.sport} />

      <div className="victory-dialog__actions">
        <button type="button" className="btn btn--ghost btn--lg" onClick={onClose}>
          {t.victory.viewBoard}
        </button>
        <button type="button" className="btn btn--solution btn--lg" onClick={onShowSolution}>
          {t.daily.solution.show}
        </button>
        <Link href={`/${challenge.sport}/free`} className="btn btn--primary btn--lg">
          {t.daily.freePlay}
        </Link>
      </div>
    </Modal>
  )
}
