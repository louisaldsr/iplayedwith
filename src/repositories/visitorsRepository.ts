import { SupabaseClient } from '@supabase/supabase-js'
import { VisitorId } from '@/domain/dailyResult'
import { NameWords, VisitorName, visitorNameOf } from '@/domain/visitorName'

type NameRow = { name_adjective: string; name_noun: string; name_number: number }

/**
 * The visitor's name: the one it already has, or — for a new visitor — `words` plus a number
 * still free for them. A name never changes. See supabase/migrations/018_visitor_number.sql.
 *
 * Throws when the pair has no free number left, or when another new visitor took the same one at
 * the same instant: the caller draws again. Requires the service_role client.
 */
export async function ensure(db: SupabaseClient, id: VisitorId, words: NameWords): Promise<VisitorName> {
  const { data, error } = await db.rpc('ensure_visitor', {
    p_id: id,
    p_name_adjective: words.adjective,
    p_name_noun: words.noun,
  })
  if (error) throw new Error(error.message)

  const row = (data as NameRow[])[0]
  const name = row && visitorNameOf(row.name_adjective, row.name_noun, row.name_number)
  if (!name) throw new Error(`visitor ${id} has no readable name`)
  return name
}
