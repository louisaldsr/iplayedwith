import { Season } from './season'
import { SportId } from './sport'

/**
 * The first season each sport's data covers — the first full season of its import, not its earliest
 * row: rugby has 69 memberships from 4 clubs in 2012-2013, against 1 828 from 37 clubs in 2013-2014.
 * Earlier seasons are not in the game, so a career that began before reads as starting there: the
 * career dialog and About say so. Formula 1 too: its data starts with the first championship, but a
 * driver of 1950 (Fangio) raced long before it.
 *
 * Re-read after an import that reaches further back:
 * `select sport, season, count(*) from memberships group by 1, 2 order by 1, 2`.
 */
export const DATA_SINCE: Record<SportId, Season> = {
  rugby: Season('2013-2014'),
  football: Season('2012-2013'),
  basketball: Season('1979-1980'),
  formula1: Season('1950'),
}
