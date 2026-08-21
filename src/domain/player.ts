import { PlayerId } from './ids';
import { SportId } from './sport';
import { Nationality } from './nationality';

/** A player belonging to a specific sport's dataset. */
export type Player = {
  id: PlayerId;
  name: string;
  sport: SportId;
  nationality?: Nationality;
};
