import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getClub } from '@/services/clubsService'
import { listRoster } from '@/services/membershipsService'
import { NotFoundError, ValidationError } from '@/services/errors'
import { SeasonRosterEditor } from '@/components/admin/SeasonRosterEditor'

export default async function SeasonRosterPage({
  params,
}: {
  params: Promise<{ id: string; season: string }>
}) {
  const { id, season } = await params

  try {
    const db = supabaseAdmin()
    const club = await getClub(db, id)
    const roster = await listRoster(db, id, season)

    return <SeasonRosterEditor club={club} season={season} initialRoster={roster} />
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ValidationError) notFound()
    throw err
  }
}
