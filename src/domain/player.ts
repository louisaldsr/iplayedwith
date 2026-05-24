import { PlayerId } from './ids';

/** A rugby player as stored in the domain. */
export type Player = {
  id: PlayerId;
  name: string;
};
