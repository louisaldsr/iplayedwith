import { ClubId } from './ids';
import { SportId } from './sport';

/** A club/team belonging to a specific sport's dataset. */
export type Club = {
  id: ClubId;
  name: string;
  sport: SportId;
  logoUrl?: string;
};
