import { ChallengeDay } from '@/domain/dailyChallenge'
import { isVisitorId, VisitorId } from '@/domain/dailyResult'
import { ValidationError } from '@/services/errors'

/**
 * The part every daily-result request shares: which day the client was shown, and who it is.
 * Throws `ValidationError` (400) before anything touches the database.
 */
export function parseDailyRequest(body: unknown): {
  day: ChallengeDay
  visitorId: VisitorId
  raw: Record<string, unknown>
} {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (!isVisitorId(raw.visitorId)) throw new ValidationError('visitorId must be a UUID')
  try {
    return { day: ChallengeDay(String(raw.day)), visitorId: raw.visitorId, raw }
  } catch {
    throw new ValidationError('day must be a YYYY-MM-DD date')
  }
}
