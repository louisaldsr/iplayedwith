'use client'

import { useCallback, useEffect, useState } from 'react'
import { Player } from '../../domain/player'
import { ClubSearchResult } from '../../domain/club'
import { PlayerId } from '../../domain/ids'
import { Season } from '../../domain/season'
import { SportId } from '../../domain/sport'
import { DifficultyLevel } from '../../game/game'
import { UserInput } from '../../game/userInput'
import { useTranslations } from '../../i18n'
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch'
import { searchPlayers, searchClubs, listClubSeasons } from '../../lib/gameApi'
import { searchEquals } from '../../lib/searchNormalize'
import { AutocompleteInput } from '../shared/AutocompleteInput'

type Props = {
  sport: SportId
  difficulty: DifficultyLevel
  alreadyInGraph: Set<PlayerId>
  submitting?: boolean
  onSubmit: (input: UserInput) => void
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

export function MoveInput({ sport, difficulty, alreadyInGraph, submitting = false, onSubmit }: Props) {
  const t = useTranslations()

  // Easy mode state
  const [easyQuery, setEasyQuery] = useState('')
  const [easyPlayer, setEasyPlayer] = useState<Player | null>(null)

  // Hard mode state
  const [hardMode, setHardMode] = useState<'player' | 'club'>('player')
  const [hardPlayerQuery, setHardPlayerQuery] = useState('')
  const [hardPlayer, setHardPlayer] = useState<Player | null>(null)
  const [hardClubQuery, setHardClubQuery] = useState('')
  const [hardClub, setHardClub] = useState<ClubSearchResult | null>(null)
  const [hardSeason, setHardSeason] = useState<Season | null>(null)
  const [availableSeasons, setAvailableSeasons] = useState<Season[]>([])

  const playerSearch = useCallback(
    (q: string, signal: AbortSignal) => searchPlayers(sport, q, signal),
    [sport],
  )
  const clubSearch = useCallback(
    (q: string, signal: AbortSignal) => searchClubs(sport, q, signal),
    [sport],
  )

  const activePlayerQuery = difficulty === 'easy' ? easyQuery : hardPlayerQuery
  const { results: playerResults, loading: playersLoading, failed: playersFailed } = useDebouncedSearch(
    activePlayerQuery,
    playerSearch,
  )
  const { results: clubResults, loading: clubsLoading, failed: clubsFailed } = useDebouncedSearch(
    hardClubQuery,
    clubSearch,
  )

  // Players already on the board can't be submitted again; filtering the ≤20 returned
  // rows is all that's needed now the full roster is never loaded.
  const available = playerResults.filter(p => !alreadyInGraph.has(p.id))

  // A club found through an alias shows it as the hint: "Stade Rochelais · La Rochelle".
  const clubSuggestions = clubResults.map(c => ({ ...c, hint: c.matchedAlias }))

  /**
   * Whether the typed text names this club — its official name, or the alias the player
   * actually searched with. Without the alias arm, typing "la rochelle" in full would
   * leave Submit disabled even though the row is right there in the dropdown.
   */
  const clubMatches = (club: ClubSearchResult, typed: string) =>
    searchEquals(club.name, typed) || searchEquals(club.matchedAlias, typed)

  // Seasons come from the server per club — hard mode used to derive them by scanning the
  // full membership list.
  useEffect(() => {
    if (!hardClub) {
      setAvailableSeasons([])
      return
    }

    let cancelled = false
    const controller = new AbortController()

    listClubSeasons(hardClub.id, controller.signal)
      .then(seasons => {
        if (!cancelled) setAvailableSeasons(seasons)
      })
      .catch(() => {
        if (!cancelled) setAvailableSeasons([])
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hardClub])

  function switchHardMode(mode: 'player' | 'club') {
    setHardMode(mode)
    setHardPlayer(null)
    setHardPlayerQuery('')
    setHardClub(null)
    setHardClubQuery('')
    setHardSeason(null)
  }

  // ── Easy mode ──────────────────────────────────────────────────────────────

  function handleEasyPlayerSelect(player: Player) {
    setEasyPlayer(player)
    setEasyQuery(player.name)
  }

  function handleEasySubmit(e: React.FormEvent) {
    e.preventDefault()
    const player = easyPlayer
      ?? available.find(p => searchEquals(p.name, easyQuery))
      ?? null
    if (!player) return
    onSubmit({ kind: 'easy', playerId: player.id })
  }

  if (difficulty === 'easy') {
    const easyCanSubmit = !submitting && (
      !!easyPlayer || available.some(p => searchEquals(p.name, easyQuery))
    )
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
            suggestions={available}
            loading={playersLoading}
            emptyLabel={t.game.noSuggestions}
            failed={playersFailed}
            errorLabel={t.game.searchUnavailable}
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

  function handleHardPlayerSelect(player: Player) {
    setHardPlayer(player)
    setHardPlayerQuery(player.name)
  }

  function handleHardClubSelect(club: ClubSearchResult) {
    setHardClub(club)
    // Always the official name, even when the alias is what was typed — the chip and the
    // season list are about the club itself.
    setHardClubQuery(club.name)
    setHardSeason(null)
  }

  function handleHardSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hardMode === 'player') {
      const player = hardPlayer
        ?? available.find(p => searchEquals(p.name, hardPlayerQuery))
        ?? null
      if (!player) return
      onSubmit({ kind: 'hard-player', playerId: player.id })
    } else {
      const club = hardClub
        ?? clubResults.find(c => clubMatches(c, hardClubQuery))
        ?? null
      if (!club || !hardSeason) return
      onSubmit({ kind: 'hard-club', clubId: club.id, season: hardSeason })
    }
  }

  const hardCanSubmit = !submitting && (
    hardMode === 'player'
      ? (!!hardPlayer || available.some(p => searchEquals(p.name, hardPlayerQuery)))
      : ((!!hardClub || clubResults.some(c => clubMatches(c, hardClubQuery))) && !!hardSeason)
  )

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
            suggestions={available}
            loading={playersLoading}
            emptyLabel={t.game.noSuggestions}
            failed={playersFailed}
            errorLabel={t.game.searchUnavailable}
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
              loading={clubsLoading}
              emptyLabel={t.game.noSuggestions}
              failed={clubsFailed}
              errorLabel={t.game.searchUnavailable}
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
