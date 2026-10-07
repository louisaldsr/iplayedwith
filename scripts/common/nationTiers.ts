/**
 * The weight of one international cap from the national team's world ranking — the rows an import
 * writes into `nation_tiers` (supabase/migrations/025_fame_v3.sql).
 *
 * Four tiers, like rugby's curated ones: the top 10 count fully, 11–30 half, 31–60 a fifth, the
 * rest a tenth. Shared by every sport whose source publishes a ranking (football: FIFA, basketball:
 * FIBA). A snapshot taken at import time: a nation that slipped just outside the top 10 weighs 0.5
 * for every cap it ever gave.
 */
export function rankTierWeight(worldRank: number): number {
  if (worldRank <= 10) return 1
  if (worldRank <= 30) return 0.5
  if (worldRank <= 60) return 0.2
  return 0.1
}
