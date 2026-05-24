import { ClubId, PlayerId } from './ids';
import { Season } from './season';

/** Records that a player belonged to a club for a given season. */
export type Membership = {
  playerId: PlayerId;
  clubId: ClubId;
  season: Season;
};
