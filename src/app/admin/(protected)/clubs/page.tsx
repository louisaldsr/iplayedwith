'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SPORTS, SportId } from '@/domain/sport'

type ClubResult = { id: string; name: string }

export default function ClubsPickerPage() {
  const [sport, setSport] = useState<SportId>(SPORTS[0])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubResult[]>([])
  const [searching, setSearching] = useState(false)

  async function search(nextSport: SportId, nextQuery: string) {
    setSearching(true)
    const res = await fetch(`/api/clubs?sport=${nextSport}&q=${encodeURIComponent(nextQuery)}`)
    setResults(res.ok ? await res.json() : [])
    setSearching(false)
  }

  function handleSportChange(nextSport: SportId) {
    setSport(nextSport)
    if (query.trim()) search(nextSport, query)
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    if (value.trim().length === 0) {
      setResults([])
      return
    }
    search(sport, value)
  }

  return (
    <div className="admin-form">
      <h1 className="admin-form__title">Clubs</h1>
      <p className="admin-form__subtitle">Find a club to manage its season-by-season rosters</p>

      <div className="admin-form__body">
        <div className="form-field">
          <label className="form-label" htmlFor="club-sport">Sport</label>
          <select
            id="club-sport"
            className="form-select"
            value={sport}
            onChange={e => handleSportChange(e.target.value as SportId)}
          >
            {SPORTS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="club-query">Club name</label>
          <input
            id="club-query"
            className="form-input"
            placeholder="Toulouse"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {searching && <p className="admin-form__subtitle">Searching…</p>}

      {results.length > 0 && (
        <ul className="season-list">
          {results.map(club => (
            <li key={club.id} className="season-item">
              <Link href={`/admin/clubs/${club.id}`}>{club.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
