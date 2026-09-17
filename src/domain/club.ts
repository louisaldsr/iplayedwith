import { ClubId } from './ids';
import { SportId } from './sport';

/** A club/team belonging to a specific sport's dataset. */
export type Club = {
  id: ClubId;
  name: string;
  sport: SportId;
  logoUrl?: string;
};

/**
 * A club as returned by a search, carrying why it matched.
 *
 * `matchedAlias` is set when the query hit one of the club's aliases rather than its
 * official name — "la roch" finding Stade Rochelais through "La Rochelle". It belongs to
 * the result, not to the club, which is why `Club` stays as it is.
 */
export type ClubSearchResult = Club & { matchedAlias?: string };
