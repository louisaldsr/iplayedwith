'use client'

import { useState } from 'react'
import { Player } from '../../domain/player'
import { PlayerId } from '../../domain/ids'
import { UserInput } from '../../game/engine'
import { useTranslations } from '../../i18n'

type Props = {
  players: Player[]
  alreadyInGraph: Set<PlayerId>
  onSubmit: (input: UserInput) => void
}

export function EasyInput({ players, alreadyInGraph, onSubmit }: Props) {
  const t = useTranslations()
  const [selected, setSelected] = useState<PlayerId | ''>('')
  const available = players.filter(p => !alreadyInGraph.has(p.id))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    onSubmit({ kind: 'easy', playerId: selected as PlayerId })
  }

  return (
    <form onSubmit={handleSubmit} className="input-bar">
      <select
        value={selected}
        onChange={e => setSelected(e.target.value as PlayerId | '')}
        className="input-field"
      >
        <option value="">{t.game.easyPlaceholder}</option>
        {available.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!selected} className="btn btn--primary">
        {t.game.submit}
      </button>
    </form>
  )
}
