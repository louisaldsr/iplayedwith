import { SupabaseClient } from '@supabase/supabase-js'
import { VisitorId } from '@/domain/dailyResult'

/**
 * The visitor's username: the one it already has, or — for a new visitor — `username`. A username
 * never changes. See supabase/migrations/020_visitor_username.sql.
 *
 * Throws when another visitor has `username` already: the caller draws again. Requires the
 * service_role client.
 */
export async function ensure(db: SupabaseClient, id: VisitorId, username: string): Promise<string> {
  const { data, error } = await db.rpc('ensure_visitor', { p_id: id, p_username: username })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string') throw new Error(`visitor ${id} has no username`)
  return data
}

export type RenameOutcome = 'renamed' | 'taken' | 'unknown'

/**
 * Renames the visitor. 'taken' when another visitor has the same name once normalized; 'unknown'
 * for an id the server never saw. `username` must already be validated (parseTypedUsername).
 */
export async function rename(db: SupabaseClient, id: VisitorId, username: string): Promise<RenameOutcome> {
  const { data, error } = await db.rpc('rename_visitor', { p_id: id, p_username: username })
  if (error) throw new Error(error.message)
  if (data !== 'renamed' && data !== 'taken' && data !== 'unknown') throw new Error(`rename_visitor returned ${data}`)
  return data
}

/** The candidates no visitor has yet, compared normalized, in their given order. */
export async function freeAmong(db: SupabaseClient, candidates: string[]): Promise<string[]> {
  if (candidates.length === 0) return []
  const { data, error } = await db.rpc('free_usernames', { p_candidates: candidates })
  if (error) throw new Error(error.message)
  const free = new Set(data as string[])
  return candidates.filter((c) => free.has(c))
}
