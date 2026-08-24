'use client'

import { useState } from 'react'
import { Player } from '../../domain/player'
import { useTranslations } from '../../i18n'
import { AutocompleteInput } from '../shared/AutocompleteInput'

type Props = {
  role: 'A' | 'B'
  selected: Player | null
  allPlayers: Player[]
  excludeId?: string
  onSelect: (player: Player | null) => void
}

export function PlayerPicker({ role, selected, allPlayers, excludeId, onSelect }: Props) {
  const t = useTranslations()
  const [inputValue, setInputValue] = useState('')

  const available = allPlayers.filter(p => p.id !== excludeId)
  const suggestions = available.filter(p =>
    p.name.toLowerCase().includes(inputValue.toLowerCase())
  )

  function handleSelect(name: string) {
    const match = available.find(p => p.name === name) ?? null
    setInputValue(match?.name ?? name)
    onSelect(match)
  }

  function handleInputChange(v: string) {
    setInputValue(v)
    const match = available.find(p => p.name.toLowerCase() === v.toLowerCase()) ?? null
    onSelect(match)
  }

  function handleRandomize() {
    if (available.length === 0) return
    const pick = available[Math.floor(Math.random() * available.length)]
    onSelect(pick)
    setInputValue(pick.name)
  }

  function handleChange() {
    onSelect(null)
    setInputValue('')
  }

  const roleLabel = role === 'A' ? t.setup.playerA : t.setup.playerB

  return (
    <div className={`player-picker${selected ? ' player-picker--selected' : ''}`}>
      <span className="player-picker__role">{roleLabel}</span>

      {selected ? (
        <div className="player-picker__selected">
          <img
            src="/dummy.svg"
            alt={selected.name}
            className="player-picker__avatar"
          />
          <span className="player-picker__name">{selected.name}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleChange}>
            {t.setup.change}
          </button>
        </div>
      ) : (
        <div className="player-picker__empty">
          <AutocompleteInput
            value={inputValue}
            onChange={handleInputChange}
            onSelect={handleSelect}
            suggestions={suggestions}
            placeholder={t.setup.inputPlaceholder}
            dropdownDirection="down"
          />
          <span className="player-picker__separator">{t.setup.orSeparator}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleRandomize}>
            {t.setup.randomize}
          </button>
        </div>
      )}
    </div>
  )
}
