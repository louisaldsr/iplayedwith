/**
 * The weight of one international cap, from the national team's FIFA ranking at the time of the
 * dataset build — the football rows of `nation_tiers` (supabase/migrations/025_fame_v3.sql).
 *
 * Four tiers, like rugby's: the top 10 count fully, 11–30 half, 31–60 a fifth, the rest a tenth.
 * A snapshot: caps span 2012 onwards, so a nation that slipped just outside the top 10 (Italy,
 * Croatia in 2026) weighs 0.5 for its whole period. The FIFA ranking is in the dataset, so no
 * ranking is written down here.
 */
export function nationTierWeight(fifaRanking: number): number {
  if (fifaRanking <= 10) return 1
  if (fifaRanking <= 30) return 0.5
  if (fifaRanking <= 60) return 0.2
  return 0.1
}
