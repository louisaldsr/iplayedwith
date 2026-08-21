import { SupabaseClient } from '@supabase/supabase-js'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { ClubId, PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'

export type ValidateInput = { playerAId: string; playerBId: string; clubId?: string; season?: string }
export type ValidateResult = { valid: boolean; membership: { clubId: string; season: string } | null }

/**
 * Easy mode (no clubId/season): finds the first shared membership (any club, any season).
 * Hard mode (clubId + season given): checks both players have that exact membership.
 */
export async function validateConnection(db: SupabaseClient, input: ValidateInput): Promise<ValidateResult> {
  const playerAId = PlayerId(input.playerAId)
  const playerBId = PlayerId(input.playerBId)

  if (input.clubId && input.season) {
    const clubId = ClubId(input.clubId)
    const season = input.season as Season
    const matchingPlayerIds = await membershipsRepo.hasExactForAny(db, [playerAId, playerBId], clubId, season)
    const valid = matchingPlayerIds.includes(playerAId) && matchingPlayerIds.includes(playerBId)
    return { valid, membership: valid ? { clubId: input.clubId, season: input.season } : null }
  }

  const [a, b] = await Promise.all([
    membershipsRepo.listByPlayer(db, playerAId),
    membershipsRepo.listByPlayer(db, playerBId),
  ])

  const setB = new Set(b.map((m) => `${m.clubId}|${m.season}`))
  const shared = a.find((m) => setB.has(`${m.clubId}|${m.season}`))

  return { valid: !!shared, membership: shared ? { clubId: shared.clubId, season: shared.season } : null }
}
