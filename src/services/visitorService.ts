import { SupabaseClient } from '@supabase/supabase-js'
import * as visitorsRepo from '@/repositories/visitorsRepository'
import { VisitorId } from '@/domain/dailyResult'
import { randomNameWords, VisitorName } from '@/domain/visitorName'

/** A handful of draws: a pair with no free number left, or a number taken at the same instant, are both rare. */
const MAX_DRAWS = 5

/**
 * The visitor's name, created on first sight: words drawn here, a free number picked by the
 * database. An existing visitor gets back the name it has.
 *
 * `random` is a parameter so the retries can be tested; callers leave it out.
 */
export async function ensureVisitorName(
  db: SupabaseClient,
  id: VisitorId,
  random: () => number = Math.random,
): Promise<VisitorName> {
  for (let draw = 1; ; draw++) {
    try {
      return await visitorsRepo.ensure(db, id, randomNameWords(random))
    } catch (err) {
      if (draw >= MAX_DRAWS) throw err
    }
  }
}
