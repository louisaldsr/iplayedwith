import { ClubId, PlayerId } from '../domain/ids';
import { Membership } from '../domain/membership';
import { Season } from '../domain/season';

/**
 * Read-only lookup service over a flat Membership array.
 *
 * Built once at engine creation and never mutated. Provides O(1) lookups
 * by player or club, shared membership intersection, and exact triple checks
 * used by both easy and hard validation paths.
 */
export class MembershipIndex {
  private byPlayer: Map<PlayerId, Membership[]>;
  private byClub: Map<ClubId, Membership[]>;

  /** Indexes all memberships by player and by club. */
  constructor(memberships: Membership[]) {
    this.byPlayer = new Map();
    this.byClub = new Map();
    for (const membership of memberships) {
      const playerMemberships = this.byPlayer.get(membership.playerId) ?? [];
      playerMemberships.push(membership);
      this.byPlayer.set(membership.playerId, playerMemberships);

      const clubMemberships = this.byClub.get(membership.clubId) ?? [];
      clubMemberships.push(membership);
      this.byClub.set(membership.clubId, clubMemberships);
    }
  }

  /** Returns all memberships for a given player. */
  getByPlayer(playerId: PlayerId): Membership[] {
    return this.byPlayer.get(playerId) ?? [];
  }

  /** Returns all memberships for a given club (across all seasons and players). */
  getByClub(clubId: ClubId): Membership[] {
    return this.byClub.get(clubId) ?? [];
  }

  /**
   * Returns memberships shared by both players — same club AND same season.
   * Results are sorted by start year descending (most recent season first).
   * Used in easy mode to find and rank valid connections.
   */
  findShared(playerIdA: PlayerId, playerIdB: PlayerId): Membership[] {
    const mA = this.getByPlayer(playerIdA);
    const mB = this.getByPlayer(playerIdB);
    const keysA = new Set(mA.map((m) => `${m.clubId}:${m.season}`));
    return mB
      .filter((m) => keysA.has(`${m.clubId}:${m.season}`))
      .sort(
        (a, b) => Number(b.season.slice(0, 4)) - Number(a.season.slice(0, 4))
      );
  }

  /** Returns true iff the exact (player, club, season) triple exists. Used in hard mode. */
  hasExact(playerId: PlayerId, clubId: ClubId, season: Season): boolean {
    return this.getByPlayer(playerId).some(
      (m) => m.clubId === clubId && m.season === season
    );
  }
}
