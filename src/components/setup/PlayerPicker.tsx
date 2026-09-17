'use client'

import { useCallback, useState } from 'react'
import { Player } from '../../domain/player'
import { PlayerId } from '../../domain/ids'
import { SportId } from '../../domain/sport'
import { useTranslations } from '../../i18n'
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch'
import { searchPlayers, randomPlayer } from '../../lib/gameApi'
import { searchEquals } from '../../lib/searchNormalize'
import { AutocompleteInput } from '../shared/AutocompleteInput'

type Props = {
  role: 'A' | 'B'
  sport: SportId
  selected: Player | null
  excludeId?: PlayerId
  onSelect: (player: Player | null) => void
}

export function PlayerPicker({ role, sport, selected, excludeId, onSelect }: Props) {
  const t = useTranslations()
  const [inputValue, setInputValue] = useState('')
  const [randomizing, setRandomizing] = useState(false)

  const search = useCallback(
    (q: string, signal: AbortSignal) => searchPlayers(sport, q, signal),
    [sport],
  )
  const { results, loading, failed } = useDebouncedSearch(inputValue, search)

  const available = results.filter(p => p.id !== excludeId)

  function handleSelect(player: Player) {
    setInputValue(player.name)
    onSelect(player)
  }

  function handleInputChange(v: string) {
    setInputValue(v)
    // Typing away from an exact match clears the selection, so a half-typed name never
    // leaves a stale player selected. Compared on the normalized form, so "gael fickou"
    // counts as naming "Gaël Fickou".
    const match = available.find(p => searchEquals(p.name, v)) ?? null
    onSelect(match)
  }

  async function handleRandomize() {
    setRandomizing(true)
    try {
      const pick = await randomPlayer(sport, excludeId)
      if (pick) {
        onSelect(pick)
        setInputValue(pick.name)
      }
    } finally {
      setRandomizing(false)
    }
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
            suggestions={available}
            loading={loading}
            emptyLabel={t.game.noSuggestions}
            failed={failed}
            errorLabel={t.game.searchUnavailable}
            placeholder={t.setup.inputPlaceholder}
            dropdownDirection="down"
          />
          <span className="player-picker__separator">{t.setup.orSeparator}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleRandomize}
            disabled={randomizing}
          >
            {t.setup.randomize}
          </button>
        </div>
      )}
    </div>
  )
}
