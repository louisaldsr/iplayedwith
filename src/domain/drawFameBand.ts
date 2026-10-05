/**
 * The fame band random players are drawn from — free play's "Randomize" and the daily challenge.
 *
 * Drawn uniformly, a game pitted two unknowns against each other: most of a sport scores low
 * (see fameFloor.ts). The band aims just below stardom instead: names a new player may have
 * heard of, without the handful of stars whose chain everyone finds at once. Measured on
 * revision 2: 427 rugby players (Mo'unga, Boffelli, Hamish Watson…) and 787 football players
 * (Gündoğan, Rice, Firmino…).
 *
 * A SCORE band, not a floor: it straddles the top of `known` and the bottom of `famous` on
 * purpose, and no floor is that narrow.
 *
 * Written twice — here for the random pick, and as constants in `generate_daily_challenge`
 * (supabase/migrations/019_daily_fame_band.sql). Change both together.
 */
export const DRAW_FAME_BAND = { min: 60, max: 80 } as const

export type FameBand = { min: number; max: number }
