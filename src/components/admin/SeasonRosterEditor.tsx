'use client'

import { useState } from 'react'
import { SportId } from '@/domain/sport'

type Club = { id: string; name: string; sport: SportId }
type RosterPlayer = { playerId: string; playerName: string }
type PlayerSuggestion = { id: string; name: string }

type Props = {
  club: Club
  season: string
  initialRoster: RosterPlayer[]
}

export function SeasonRosterEditor({ club, season, initialRoster }: Props) {
  const [roster, setRoster] = useState<RosterPlayer[]>(initialRoster)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [creatingName, setCreatingName] = useState('')
  const [creatingNationality, setCreatingNationality] = useState('')
  const [creating, setCreating] = useState(false)

  const rosterIds = new Set(roster.map(r => r.playerId))

  async function handleQueryChange(value: string) {
    setQuery(value)
    setError(null)
    setCreatingName(value)
    if (value.trim().length === 0) {
      setSuggestions([])
      return
    }
    setSearching(true)
    const res = await fetch(`/api/players?sport=${club.sport}&q=${encodeURIComponent(value)}`)
    const body = res.ok ? await res.json() : []
    setSearching(false)
    setSuggestions((body as PlayerSuggestion[]).filter(p => !rosterIds.has(p.id)))
  }

  async function addMembership(playerId: string, playerName: string) {
    setAdding(true)
    setError(null)
    const res = await fetch('/api/admin/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, memberships: [{ clubId: club.id, season }] }),
    })
    const body = await res.json()
    setAdding(false)

    if (!res.ok) {
      setError(body.error ?? 'Something went wrong')
      return
    }

    setRoster(rows => [...rows, { playerId, playerName }])
    setQuery('')
    setSuggestions([])
    setCreatingName('')
    setCreatingNationality('')
  }

  async function handleSelectSuggestion(suggestion: PlayerSuggestion) {
    await addMembership(suggestion.id, suggestion.name)
  }

  async function handleCreateAndAdd(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)

    const res = await fetch('/api/admin/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: creatingName,
        sport: club.sport,
        nationality: creatingNationality.trim() || undefined,
      }),
    })
    const body = await res.json()
    setCreating(false)

    if (!res.ok) {
      setError(body.error ?? 'Something went wrong')
      return
    }

    await addMembership(body.id, body.name)
  }

  async function handleRemove(playerId: string) {
    setError(null)
    await fetch(
      `/api/admin/memberships?playerId=${encodeURIComponent(playerId)}&clubId=${encodeURIComponent(club.id)}&season=${encodeURIComponent(season)}`,
      { method: 'DELETE' },
    )
    setRoster(rows => rows.filter(r => r.playerId !== playerId))
  }

  const showCreatePanel = query.trim().length > 0 && !searching && suggestions.length === 0

  return (
    <div className="admin-form">
      <h1 className="admin-form__title">{club.name}</h1>
      <p className="admin-form__subtitle">{season} — {club.sport}</p>

      {roster.length > 0 && (
        <ul className="membership-list">
          {roster.map(row => (
            <li key={row.playerId} className="input-chip">
              {row.playerName}
              <button
                type="button"
                className="input-chip__clear"
                onClick={() => handleRemove(row.playerId)}
                aria-label={`Remove ${row.playerName}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="membership-row">
        <div className="autocomplete-wrapper">
          <input
            className="autocomplete-input"
            placeholder="Search player"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          {suggestions.length > 0 && (
            <ul className="autocomplete-dropdown">
              {suggestions.map(s => (
                <li key={s.id} className="autocomplete-item" onMouseDown={() => handleSelectSuggestion(s)}>
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showCreatePanel && (
        <form onSubmit={handleCreateAndAdd} className="admin-form__body">
          <p className="admin-form__subtitle">No match for &ldquo;{query}&rdquo; — create a new player</p>
          <div className="form-field">
            <label className="form-label" htmlFor="new-player-name">Name</label>
            <input
              id="new-player-name"
              className="form-input"
              value={creatingName}
              onChange={e => setCreatingName(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="new-player-nationality">Nationality (optional)</label>
            <input
              id="new-player-nationality"
              className="form-input"
              placeholder="FR or GB-ENG"
              maxLength={6}
              value={creatingNationality}
              onChange={e => setCreatingNationality(e.target.value.toUpperCase())}
            />
          </div>
          <button type="submit" className="btn btn--ghost btn--sm" disabled={creating || adding || !creatingName.trim()}>
            {creating || adding ? 'Adding…' : 'Create & add'}
          </button>
        </form>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
