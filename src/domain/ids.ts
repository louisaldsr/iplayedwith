/** Branded string that uniquely identifies a player. */
export type PlayerId = string & { readonly _brand: 'PlayerId' };

/** Branded string that uniquely identifies a club. */
export type ClubId = string & { readonly _brand: 'ClubId' };

/** Smart constructor — casts a raw string to a PlayerId. */
export const PlayerId = (id: string): PlayerId => id as PlayerId;

/** Smart constructor — casts a raw string to a ClubId. */
export const ClubId = (id: string): ClubId => id as ClubId;
