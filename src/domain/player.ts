import { PlayerId } from './ids';
import { SportId } from './sport';

/** A player belonging to a specific sport's dataset. */
export type Player = {
  id: PlayerId;
  name: string;
  sport: SportId;
};
