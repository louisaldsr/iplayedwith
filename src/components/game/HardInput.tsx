'use client'

import { useState } from 'react'
import { Player } from '../../domain/player'
import { Club } from '../../domain/club'
import { PlayerId, ClubId } from '../../domain/ids'
import { Season } from '../../domain/season'
import { UserInput } from '../../game/engine'
import { useTranslations } from '../../i18n'

type Props = {
  players: Player[]
  clubsInGraph: Club[]
  alreadyInGraph: Set<PlayerId>
  onSubmit: (input: UserInput) => void
}

export function HardInput({ players, clubsInGraph, alreadyInGraph, onSubmit }: Props) {
  const t = useTranslations()
  const [playerId, setPlayerId] = useState<PlayerId | ''>('')
  const [clubId, setClubId] = useState<ClubId | ''>('')
  const [seasonStr, setSeasonStr] = useState('')
  const [seasonError, setSeasonError] = useState<string | null>(null)

  const available = players.filter(p => !alreadyInGraph.has(p.id))
  const canSubmit = !!playerId && !!clubId && !!seasonStr

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    try {
      const season = Season(seasonStr)
      setSeasonError(null)
      onSubmit({ kind: 'hard', playerId: playerId as PlayerId, clubId: clubId as ClubId, season })
    } catch {
      setSeasonError(t.game.seasonFormatError)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="input-bar">
      <select
        value={playerId}
        onChange={e => setPlayerId(e.target.value as PlayerId | '')}
        className="input-field"
      >
        <option value="">{t.game.playerPlaceholder}</option>
        {available.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={clubId}
        onChange={e => setClubId(e.target.value as ClubId | '')}
        className="input-field"
      >
        <option value="">{t.game.clubPlaceholder}</option>
        {clubsInGraph.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="hard-input__field">
        <input
          type="text"
          placeholder={t.game.seasonPlaceholder}
          value={seasonStr}
          onChange={e => {
            setSeasonStr(e.target.value)
            setSeasonError(null)
          }}
          className={`input-field${seasonError ? ' input-field--error' : ''}`}
          style={seasonError ? { borderColor: 'var(--error)' } : undefined}
        />
        {seasonError && <span className="input-error">{seasonError}</span>}
      </div>

      <button type="submit" disabled={!canSubmit} className="btn btn--primary">
        {t.game.submit}
      </button>
    </form>
  )
}
