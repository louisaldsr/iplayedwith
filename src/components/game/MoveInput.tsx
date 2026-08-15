'use client'

import { useState } from 'react'
import { Player } from '../../domain/player'
import { Club } from '../../domain/club'
import { Membership } from '../../domain/membership'
import { PlayerId } from '../../domain/ids'
import { Season } from '../../domain/season'
import { DifficultyLevel } from '../../game/game'
import { UserInput } from '../../game/engine'
import { useTranslations } from '../../i18n'

type Props = {
  difficulty: DifficultyLevel
  players: Player[]
  clubs: Club[]
  memberships: Membership[]
  alreadyInGraph: Set<PlayerId>
  onSubmit: (input: UserInput) => void
}

type AutocompleteInputProps = {
  value: string
  onChange: (v: string) => void
  onSelect: (name: string) => void
  suggestions: { id: string; name: string }[]
  placeholder: string
  autoFocus?: boolean
}

function AutocompleteInput({ value, onChange, onSelect, suggestions, placeholder, autoFocus }: AutocompleteInputProps) {
  return (
    <div className="autocomplete-wrapper">
      <input
        className="autocomplete-input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {value.length >= 1 && suggestions.length > 0 && (
        <ul className="autocomplete-dropdown">
          {suggestions.map(s => (
            <li
              key={s.id}
              className="autocomplete-item"
              onMouseDown={() => onSelect(s.name)}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Chip = { label: string; onClear: () => void }

function InputChip({ label, onClear }: Chip) {
  return (
    <span className="input-chip">
      {label}
      <button type="button" className="input-chip__clear" onClick={onClear} aria-label={`Remove ${label}`}>
        ×
      </button>
    </span>
  )
}

export function MoveInput({ difficulty, players, clubs, memberships, alreadyInGraph, onSubmit }: Props) {
  const t = useTranslations()

  // Easy mode state
  const [easyQuery, setEasyQuery] = useState('')
  const [easyPlayer, setEasyPlayer] = useState<Player | null>(null)

  // Hard mode state
  const [hardMode, setHardMode] = useState<'player' | 'club'>('player')
  const [hardPlayerQuery, setHardPlayerQuery] = useState('')
  const [hardPlayer, setHardPlayer] = useState<Player | null>(null)
  const [hardClubQuery, setHardClubQuery] = useState('')
  const [hardClub, setHardClub] = useState<Club | null>(null)
  const [hardSeason, setHardSeason] = useState<Season | null>(null)

  const available = players.filter(p => !alreadyInGraph.has(p.id))

  function filterByQuery(list: { id: string; name: string }[], query: string) {
    return list.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
  }

  function switchHardMode(mode: 'player' | 'club') {
    setHardMode(mode)
    setHardPlayer(null)
    setHardPlayerQuery('')
    setHardClub(null)
    setHardClubQuery('')
    setHardSeason(null)
  }

  // ── Easy mode ──────────────────────────────────────────────────────────────

  function handleEasyPlayerSelect(name: string) {
    const match = available.find(p => p.name === name) ?? null
    setEasyPlayer(match)
    setEasyQuery(match?.name ?? name)
  }

  function handleEasySubmit(e: React.FormEvent) {
    e.preventDefault()
    const player = easyPlayer
      ?? available.find(p => p.name.toLowerCase() === easyQuery.toLowerCase())
      ?? null
    if (!player) return
    onSubmit({ kind: 'easy', playerId: player.id })
  }

  if (difficulty === 'easy') {
    const suggestions = filterByQuery(available, easyQuery)
    const easyCanSubmit = !!easyPlayer
      || available.some(p => p.name.toLowerCase() === easyQuery.toLowerCase())
    return (
      <form onSubmit={handleEasySubmit} className="move-input">
        {easyPlayer ? (
          <InputChip
            label={easyPlayer.name}
            onClear={() => { setEasyPlayer(null); setEasyQuery('') }}
          />
        ) : (
          <AutocompleteInput
            value={easyQuery}
            onChange={v => { setEasyQuery(v); setEasyPlayer(null) }}
            onSelect={handleEasyPlayerSelect}
            suggestions={suggestions}
            placeholder={t.game.playerPlaceholder}
            autoFocus
          />
        )}
        <button type="submit" className="btn btn--primary" disabled={!easyCanSubmit}>
          {t.game.submit}
        </button>
      </form>
    )
  }

  // ── Hard mode ──────────────────────────────────────────────────────────────

  // All seasons for the selected club across all memberships
  const availableSeasons: Season[] = hardClub
    ? [...new Set(
        memberships
          .filter(m => m.clubId === hardClub.id)
          .map(m => m.season)
      )].sort((a, b) => Number(b.slice(0, 4)) - Number(a.slice(0, 4)))
    : []

  function handleHardPlayerSelect(name: string) {
    const match = available.find(p => p.name === name) ?? null
    setHardPlayer(match)
    setHardPlayerQuery(match?.name ?? name)
  }

  function handleHardClubSelect(name: string) {
    const match = clubs.find(c => c.name === name) ?? null
    setHardClub(match)
    setHardClubQuery(match?.name ?? name)
    setHardSeason(null)
  }

  function handleHardSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hardMode === 'player') {
      const player = hardPlayer
        ?? available.find(p => p.name.toLowerCase() === hardPlayerQuery.toLowerCase())
        ?? null
      if (!player) return
      onSubmit({ kind: 'hard-player', playerId: player.id })
    } else {
      const club = hardClub
        ?? clubs.find(c => c.name.toLowerCase() === hardClubQuery.toLowerCase())
        ?? null
      if (!club || !hardSeason) return
      onSubmit({ kind: 'hard-club', clubId: club.id, season: hardSeason })
    }
  }

  const hardCanSubmit = hardMode === 'player'
    ? (!!hardPlayer || available.some(p => p.name.toLowerCase() === hardPlayerQuery.toLowerCase()))
    : ((!!hardClub || clubs.some(c => c.name.toLowerCase() === hardClubQuery.toLowerCase())) && !!hardSeason)

  const playerSuggestions = filterByQuery(available, hardPlayerQuery)
  const clubSuggestions = filterByQuery(clubs, hardClubQuery)

  return (
    <form onSubmit={handleHardSubmit} className="move-input move-input--hard">
      <div className="move-input__toggle">
        <button
          type="button"
          className={hardMode === 'player' ? 'active' : ''}
          onClick={() => switchHardMode('player')}
        >
          {t.game.addPlayer}
        </button>
        <button
          type="button"
          className={hardMode === 'club' ? 'active' : ''}
          onClick={() => switchHardMode('club')}
        >
          {t.game.addClub}
        </button>
      </div>

      {hardMode === 'player' && (
        hardPlayer ? (
          <InputChip
            label={hardPlayer.name}
            onClear={() => { setHardPlayer(null); setHardPlayerQuery('') }}
          />
        ) : (
          <AutocompleteInput
            value={hardPlayerQuery}
            onChange={v => { setHardPlayerQuery(v); setHardPlayer(null) }}
            onSelect={handleHardPlayerSelect}
            suggestions={playerSuggestions}
            placeholder={t.game.playerPlaceholder}
            autoFocus
          />
        )
      )}

      {hardMode === 'club' && (
        <>
          {hardClub ? (
            <InputChip
              label={hardClub.name}
              onClear={() => { setHardClub(null); setHardClubQuery(''); setHardSeason(null) }}
            />
          ) : (
            <AutocompleteInput
              value={hardClubQuery}
              onChange={v => { setHardClubQuery(v); setHardClub(null) }}
              onSelect={handleHardClubSelect}
              suggestions={clubSuggestions}
              placeholder={t.game.clubSearchPlaceholder}
              autoFocus
            />
          )}
          {hardClub && (
            <div className="season-chips">
              {availableSeasons.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`season-btn${hardSeason === s ? ' season-btn--selected' : ''}`}
                  onClick={() => setHardSeason(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <button type="submit" className="btn btn--primary" disabled={!hardCanSubmit}>
        {t.game.submit}
      </button>
    </form>
  )
}
