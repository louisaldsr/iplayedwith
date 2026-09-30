import { SupabaseClient } from '@supabase/supabase-js'
import { VisitorId } from '@/domain/dailyResult'
import { VisitorName } from '@/domain/visitorName'

/**
 * Creates the visitor with `name` — or does nothing if it exists: a name, once drawn, never
 * changes. See supabase/migrations/017_visitors.sql. Requires the service_role client.
 */
export async function ensure(db: SupabaseClient, id: VisitorId, name: VisitorName): Promise<void> {
  const { error } = await db.rpc('ensure_visitor', {
    p_id: id,
    p_name_adjective: name.adjective,
    p_name_noun: name.noun,
  })
  if (error) throw new Error(error.message)
}
