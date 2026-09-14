import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getClub } from '@/services/clubsService'
import { listClubSeasons } from '@/services/membershipsService'
import { NotFoundError } from '@/services/errors'
import { GoToSeasonForm } from '@/components/admin/GoToSeasonForm'

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const db = supabaseAdmin()
  let club
  try {
    club = await getClub(db, id)
  } catch (err) {
    if (err instanceof NotFoundError) notFound()
    throw err
  }

  const seasons = await listClubSeasons(db, id)

  return (
    <div className="admin-form">
      <h1 className="admin-form__title">{club.name}</h1>
      <p className="admin-form__subtitle">{club.sport}</p>

      <GoToSeasonForm clubId={club.id} />

      {seasons.length > 0 ? (
        <ul className="season-list">
          {seasons.map(({ season, playerCount }) => (
            <li key={season} className="season-item">
              <Link href={`/admin/clubs/${club.id}/seasons/${season}`}>
                {season} — {playerCount} player{playerCount === 1 ? '' : 's'}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-form__subtitle">No seasons entered yet.</p>
      )}
    </div>
  )
}
