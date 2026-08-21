'use client'

import { useState } from 'react'
import { SPORTS, SportId } from '@/domain/sport'
import { Season } from '@/domain/season'

type CreatedPlayer = { id: string; name: string; sport: SportId; nationality?: string }
type ClubSuggestion = { id: string; name: string }
type StagedRow = { key: string; clubId: string; clubName: string; season: string }
type SavedRow = { clubId: string; clubName: string; season: string }

export default function NewPlayerPage() {
  // ── Stage 1: create the player ──────────────────────────────────────────
  const [name, setName] = useState('')
  const [sport, setSport] = useState<SportId>(SPORTS[0])
  const [nationality, setNationality] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [player, setPlayer] = useState<CreatedPlayer | null>(null)

  // ── Stage 2: build the player's career ──────────────────────────────────
  const [clubQuery, setClubQuery] = useState('')
  const [clubSuggestions, setClubSuggestions] = useState<ClubSuggestion[]>([])
  const [selectedClub, setSelectedClub] = useState<ClubSuggestion | null>(null)
  const [seasonInput, setSeasonInput] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)
  const [staged, setStaged] = useState<StagedRow[]>([])
  const [saved, setSaved] = useState<SavedRow[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleCreatePlayer(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)

    const res = await fetch('/api/admin/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sport, nationality: nationality.trim() || undefined }),
    })
    const body = await res.json()
    setCreating(false)

    if (!res.ok) {
      setCreateError(body.error ?? 'Something went wrong')
      return
    }

    setPlayer(body)
  }

  async function handleClubQueryChange(value: string) {
    setClubQuery(value)
    setSelectedClub(null)
    if (!player || value.trim().length === 0) {
      setClubSuggestions([])
      return
    }
    const res = await fetch(`/api/clubs?sport=${player.sport}&q=${encodeURIComponent(value)}`)
    setClubSuggestions(res.ok ? await res.json() : [])
  }

  function handleSelectClub(club: ClubSuggestion) {
    setSelectedClub(club)
    setClubQuery(club.name)
    setClubSuggestions([])
  }

  function handleAddRow() {
    setRowError(null)
    if (!selectedClub) {
      setRowError('Pick a club from the suggestions')
      return
    }
    try {
      const season = Season(seasonInput)
      setStaged(rows => [
        ...rows,
        { key: `${selectedClub.id}-${season}-${rows.length}`, clubId: selectedClub.id, clubName: selectedClub.name, season },
      ])
      setSelectedClub(null)
      setClubQuery('')
      setSeasonInput('')
    } catch (err) {
      setRowError((err as Error).message)
    }
  }

  function handleRemoveStaged(key: string) {
    setStaged(rows => rows.filter(r => r.key !== key))
  }

  async function handleSaveCareer() {
    if (!player || staged.length === 0) return
    setSaving(true)
    setSaveError(null)

    const res = await fetch('/api/admin/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: player.id,
        memberships: staged.map(r => ({ clubId: r.clubId, season: r.season })),
      }),
    })
    const body = await res.json()
    setSaving(false)

    if (!res.ok) {
      setSaveError(body.error ?? 'Something went wrong')
      return
    }

    setSaved(rows => [...rows, ...staged.map(({ clubId, clubName, season }) => ({ clubId, clubName, season }))])
    setStaged([])
  }

  async function handleRemoveSaved(row: SavedRow) {
    if (!player) return
    await fetch(
      `/api/admin/memberships?playerId=${encodeURIComponent(player.id)}&clubId=${encodeURIComponent(row.clubId)}&season=${encodeURIComponent(row.season)}`,
      { method: 'DELETE' },
    )
    setSaved(rows => rows.filter(r => !(r.clubId === row.clubId && r.season === row.season)))
  }

  function handleDone() {
    setPlayer(null)
    setName('')
    setNationality('')
    setStaged([])
    setSaved([])
    setClubQuery('')
    setSelectedClub(null)
    setSeasonInput('')
  }

  if (!player) {
    return (
      <div className="admin-form">
        <h1 className="admin-form__title">Add player</h1>
        <form onSubmit={handleCreatePlayer} className="admin-form__body">
          <div className="form-field">
            <label className="form-label" htmlFor="player-name">Name</label>
            <input
              id="player-name"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="player-sport">Sport</label>
            <select
              id="player-sport"
              className="form-select"
              value={sport}
              onChange={e => setSport(e.target.value as SportId)}
            >
              {SPORTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="player-nationality">Nationality (optional)</label>
            <input
              id="player-nationality"
              className="form-input"
              placeholder="FR or GB-ENG"
              maxLength={6}
              value={nationality}
              onChange={e => setNationality(e.target.value.toUpperCase())}
            />
          </div>

          {createError && <div className="error-banner">{createError}</div>}

          <button type="submit" className="btn btn--primary" disabled={creating || !name}>
            {creating ? 'Creating…' : 'Create player'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="admin-form">
      <h1 className="admin-form__title">{player.name}&rsquo;s career</h1>
      <p className="admin-form__subtitle">{player.sport}</p>

      {saved.length > 0 && (
        <ul className="membership-list">
          {saved.map(row => (
            <li key={`${row.clubId}-${row.season}`} className="input-chip">
              {row.clubName} — {row.season}
              <button
                type="button"
                className="input-chip__clear"
                onClick={() => handleRemoveSaved(row)}
                aria-label={`Remove ${row.clubName} ${row.season}`}
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
            placeholder="Club"
            value={clubQuery}
            onChange={e => handleClubQueryChange(e.target.value)}
            autoComplete="off"
          />
          {clubSuggestions.length > 0 && (
            <ul className="autocomplete-dropdown">
              {clubSuggestions.map(c => (
                <li key={c.id} className="autocomplete-item" onMouseDown={() => handleSelectClub(c)}>
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          className="form-input"
          placeholder="2022-2023"
          value={seasonInput}
          onChange={e => setSeasonInput(e.target.value)}
        />
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleAddRow}>
          + Add
        </button>
      </div>
      {rowError && <div className="error-banner">{rowError}</div>}

      {staged.length > 0 && (
        <ul className="membership-list">
          {staged.map(row => (
            <li key={row.key} className="input-chip">
              {row.clubName} — {row.season}
              <button
                type="button"
                className="input-chip__clear"
                onClick={() => handleRemoveStaged(row.key)}
                aria-label={`Remove ${row.clubName} ${row.season}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {saveError && <div className="error-banner">{saveError}</div>}

      <div className="admin-form__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSaveCareer}
          disabled={saving || staged.length === 0}
        >
          {saving ? 'Saving…' : 'Save career'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={handleDone}>
          Done — add another player
        </button>
      </div>
    </div>
  )
}
