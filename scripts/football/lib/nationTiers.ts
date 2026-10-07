import { rankTierWeight } from '../../common/nationTiers'

/**
 * The weight of one international cap, from the national team's FIFA ranking at the time of the
 * dataset build — the football rows of `nation_tiers`. The tiers are the shared rule
 * (scripts/common/nationTiers.ts); the FIFA ranking is in the dataset, so none is written down here.
 */
export const nationTierWeight = (fifaRanking: number): number => rankTierWeight(fifaRanking)
