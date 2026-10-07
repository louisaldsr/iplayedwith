'use client'

import Link from 'next/link'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { DailyStats } from './DailyStats'
import { DailyRanking } from './DailyRanking'
import { ShareButton } from './ShareButton'

type Props = {
  open: boolean
  /** Closing leaves the lost board on screen — the pop-up never navigates away. */
  onClose: () => void
  challenge: DailyChallenge
  /** Closes the results and lays the proposed solution over the board. */
  onShowSolution: () => void
  /** The message the day is shared with. */
  shareText?: string
}

/**
 * The results of a lost daily, over the board — the defeat's twin of `VictoryDialog`. It opens on
 * the last life lost and leads to the proposed solution: the chain that was missed, shown on the
 * visitor's own board.
 */
export function DefeatDialog({ open, onClose, challenge, onShowSolution, shareText }: Props) {
  const t = useTranslations()
  return (
    <Modal open={open} onClose={onClose} labelledBy="defeat-title" className="victory-dialog defeat-dialog">
      <span className="victory-dialog__trophy" aria-hidden="true">
        💔
      </span>
      <h2 id="defeat-title" className="defeat-dialog__heading">
        {t.daily.lostTitle}
      </h2>
      <div className="victory-score">
        <p className="defeat-dialog__text">{t.daily.lostText(challenge.optimalLinks - 1)}</p>
        {/* Right under "a chain existed": that chain. */}
        <button type="button" className="btn btn--solution btn--sm victory-score__solution" onClick={onShowSolution}>
          {t.daily.solution.show}
        </button>
        {shareText && <ShareButton text={shareText} className="victory-score__share" />}
      </div>

      <DailyRanking sport={challenge.sport} day={challenge.day} />
      <DailyStats sport={challenge.sport} />

      {/* Game, ranking, stats, then what to do next — each part set apart. */}
      <hr className="victory-dialog__divider" />

      <div className="victory-dialog__actions">
        <button type="button" className="btn btn--primary victory-dialog__main" onClick={onClose}>
          {t.victory.viewBoard}
        </button>
        <div className="victory-dialog__more">
          <Link href={`/${challenge.sport}/archive`} className="btn btn--ghost btn--lg">
            {t.archive.link}
          </Link>
          <Link href={`/${challenge.sport}/free`} className="btn btn--ghost btn--lg">
            {t.daily.freePlay}
          </Link>
        </div>
      </div>
    </Modal>
  )
}
