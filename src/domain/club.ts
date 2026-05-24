import { ClubId } from './ids';

/** A rugby club as stored in the domain. */
export type Club = {
  id: ClubId;
  name: string;
};
