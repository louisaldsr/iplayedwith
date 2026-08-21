'use client'

import { useState } from 'react'
import { SPORTS, SportId } from '@/domain/sport'

export default function NewClubPage() {
  const [name, setName] = useState('')
  const [sport, setSport] = useState<SportId>(SPORTS[0])
  const [logoUrl, setLogoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    const res = await fetch('/api/admin/clubs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sport, logoUrl: logoUrl || undefined }),
    })
    const body = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(body.error ?? 'Something went wrong')
      return
    }

    setSuccess(`Created "${body.name}"`)
    setName('')
    setLogoUrl('')
  }

  return (
    <div className="admin-form">
      <h1 className="admin-form__title">Add club</h1>
      <form onSubmit={handleSubmit} className="admin-form__body">
        <div className="form-field">
          <label className="form-label" htmlFor="club-name">Name</label>
          <input
            id="club-name"
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="club-sport">Sport</label>
          <select
            id="club-sport"
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
          <label className="form-label" htmlFor="club-logo">Logo URL (optional)</label>
          <input
            id="club-logo"
            className="form-input"
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
          />
        </div>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        <button type="submit" className="btn btn--primary" disabled={submitting || !name}>
          {submitting ? 'Saving…' : 'Create club'}
        </button>
      </form>
    </div>
  )
}
