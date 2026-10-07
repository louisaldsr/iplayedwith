'use client'

import { SportId } from '../../domain/sport'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { SportTabs } from '../shared/SportTabs'
import { DailyRanking } from '../daily/DailyRanking'

type Props = {
  open: boolean
  onClose: () => void
  icons: Record<SportId, string>
}

/**
 * The menu's "Ranking": today's podium and the visitor's place, one tab per sport.
 *
 * The content is mounted only while open: the ranking moves all day, so it is fetched fresh on
 * every opening — every sport at once, kept while the dialog stays open.
 */
export function RankingDialog({ open, onClose, icons }: Props) {
  const t = useTranslations()
  return (
    <Modal open={open} onClose={onClose} labelledBy="ranking-title" className="stats-dialog ranking-dialog">
      {open && (
        <>
          <h2 id="ranking-title" className="stats-dialog__title">
            <span className="stats-dialog__name">{t.daily.ranking.title}</span>
          </h2>
          <SportTabs idPrefix="ranking" label={t.daily.stats.sports} icons={icons}>
            {(sport) => <DailyRanking sport={sport} heading={false} />}
          </SportTabs>
        </>
      )}
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {t.daily.close}
      </button>
    </Modal>
  )
}
