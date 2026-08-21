import { Nationality } from './nationality';
import { SportId } from './sport';

/**
 * Resolves which national team a player represents for a given sport.
 * Northern Ireland is the only home nation whose team assignment depends on
 * the sport: it fields its own team in football but plays for a unified
 * Ireland team in rugby.
 */
export function nationalTeamFor(nationality: Nationality, sport: SportId): Nationality {
  if (nationality !== 'GB-NIR') return nationality;
  switch (sport) {
    case 'rugby':
      return Nationality('IE');
    case 'football':
      return nationality;
    default:
      return Nationality('GB');
  }
}
