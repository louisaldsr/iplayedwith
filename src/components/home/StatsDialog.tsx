'use client'

import { SportId } from '../../domain/sport'
import { formatUsername } from '../../domain/visitorName'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { DailyStats } from '../daily/DailyStats'
import { useUsername } from '../shared/useUsername'
import { SportTabs } from '../shared/SportTabs'

type Props = {
  open: boolean
  onClose: () => void
  icons: Record<SportId, string>
}

/**
 * The menu's "My stats": whose stats they are first — the visitor's username — then one tab per
 * sport.
 *
 * The content is mounted only while open: the name is read fresh (after a rename from the badge)
 * and the stats are fetched when asked for.
 */
export function StatsDialog({ open, onClose, icons }: Props) {
  const t = useTranslations()
  return (
    <Modal open={open} onClose={onClose} labelledBy="stats-title" className="stats-dialog">
      {open && <StatsContent icons={icons} />}
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {t.daily.close}
      </button>
    </Modal>
  )
}

function StatsContent({ icons }: { icons: Record<SportId, string> }) {
  const t = useTranslations()
  const { username } = useUsername()

  return (
    <>
      <h2 id="stats-title" className="stats-dialog__title">
        <span className="stats-dialog__eyebrow">{t.daily.stats.title}</span>
        {username && <span className="stats-dialog__name">{formatUsername(username, t.visitorNames)}</span>}
      </h2>

      <SportTabs idPrefix="stats" label={t.daily.stats.sports} icons={icons}>
        {(sport) => <DailyStats sport={sport} heading={false} />}
      </SportTabs>
    </>
  )
}
