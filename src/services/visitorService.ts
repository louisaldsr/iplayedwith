import { SupabaseClient } from '@supabase/supabase-js'
import * as visitorsRepo from '@/repositories/visitorsRepository'
import { VisitorId } from '@/domain/dailyResult'
import { randomVisitorName, toUsername } from '@/domain/visitorName'
import { parseTypedUsername, usernameVariants, UsernameProblem } from '@/domain/username'
import { NotFoundError } from '@/services/errors'

/** A handful of draws: with 1,120,000 names, drawing a taken one is rare. */
const MAX_DRAWS = 5

/**
 * The visitor's username, created on first sight: all three parts drawn here, and drawn again
 * whole when the database refuses a name already taken. An existing visitor gets back the
 * username it has.
 *
 * `random` is a parameter so the retries can be tested; callers leave it out.
 */
export async function ensureUsername(
  db: SupabaseClient,
  id: VisitorId,
  random: () => number = Math.random,
): Promise<string> {
  for (let draw = 1; ; draw++) {
    try {
      return await visitorsRepo.ensure(db, id, toUsername(randomVisitorName(random)))
    } catch (err) {
      if (draw >= MAX_DRAWS) throw err
    }
  }
}

/** How many alternatives to offer when a name is taken. */
const SUGGESTIONS = 3

export type RenameResult =
  | { status: 'renamed'; username: string }
  | { status: 'taken'; suggestions: string[] }
  | { status: 'invalid'; problem: UsernameProblem }

/**
 * Renames the visitor to what it typed. A name taken — the same once normalized — comes back with
 * a few free variants to pick from instead. Suggestions are best effort: failing to find them never
 * fails the answer.
 */
export async function renameVisitor(db: SupabaseClient, id: VisitorId, raw: string): Promise<RenameResult> {
  const parsed = parseTypedUsername(raw)
  if (!parsed.ok) return { status: 'invalid', problem: parsed.problem }

  const outcome = await visitorsRepo.rename(db, id, parsed.username)
  if (outcome === 'unknown') throw new NotFoundError(`visitor ${id} not found`)
  if (outcome === 'renamed') return { status: 'renamed', username: parsed.username }

  const suggestions = await visitorsRepo
    .freeAmong(db, usernameVariants(parsed.username))
    .then((free) => free.slice(0, SUGGESTIONS))
    .catch((err) => {
      console.error('username suggestions failed', err)
      return []
    })
  return { status: 'taken', suggestions }
}
