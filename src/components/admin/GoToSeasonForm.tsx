'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Season } from '@/domain/season'

export function GoToSeasonForm({ clubId }: { clubId: string }) {
  const router = useRouter()
  const [seasonInput, setSeasonInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const season = Season(seasonInput)
      router.push(`/admin/clubs/${clubId}/seasons/${season}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-form__body">
      <div className="membership-row">
        <input
          className="form-input"
          placeholder="2022-2023"
          value={seasonInput}
          onChange={e => setSeasonInput(e.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--sm">
          Open season
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </form>
  )
}
