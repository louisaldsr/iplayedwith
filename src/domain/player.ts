import { PlayerId } from './ids'
import { SportId } from './sport'
import { Nationality } from './nationality'
import { FameFloor } from './fameFloor'

/** A player belonging to a specific sport's dataset. */
export type Player = {
  id: PlayerId
  name: string
  sport: SportId
  nationality?: Nationality
  /**
   * Set only on the players a move adds to the board — the one place the game shows it. Never
   * the raw score: the client only ever sees the floor. Absent when the score is not computed.
   */
  fameFloor?: FameFloor
}
