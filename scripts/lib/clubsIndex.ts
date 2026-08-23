import fs from 'node:fs';

export type CsvClub = {
  id: string;
  name: string;
  sport: string;
  logoUrl: string;
};

export function parseClubsCsv(csvPath: string): CsvClub[] {
  const lines = fs
    .readFileSync(csvPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const [, ...rows] = lines; // drop header
  return rows.map((line) => {
    const [id, name, sport, logoUrl] = line.split(',');
    return { id, name, sport, logoUrl };
  });
}

/**
 * allrugby.com profile pages display short club names (e.g. "Toulon") while
 * clubs.csv holds official names (e.g. "RC Toulon"). Seeded from a confirmed
 * example — extend as real mismatches surface in manual-review.france.csv.
 */
export const ALIASES: Record<string, string> = {
  bayonne: 'Aviron Bayonnais',
  bordeaux: 'Union Bordeaux Bègles',
  castres: 'Castres Olympique',
  clermont: 'ASM Clermont',
  'la rochelle': 'Stade Rochelais',
  lyon: 'Lyon OU',
  montpellier: 'Montpellier Hérault Rugby',
  paris: 'Stade Français Paris',
  pau: 'Section Paloise',
  perpignan: 'USA Perpignan',
  'racing 92': 'Racing 92',
  toulon: 'RC Toulon',
  toulouse: 'Stade Toulousain',
  vannes: 'RC Vannes',

  agen: 'SU Agen',
  aix: 'Provence Rugby',
  aurillac: 'Stade Aurillacois',
  beziers: 'AS Béziers Hérault',
  biarritz: 'Biarritz Olympique PB',
  brive: 'CA Brive',
  narbonne: 'RC Narbonnais',
  nice: 'Nissa Rugby',

  carcassonne: 'US Carcassonne', // Pauillac is a suburb of Carcassonne
  'mont-de-marsan': 'Stade Montois Rugby',
};

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalize(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsWhole(haystack: string, needle: string): boolean {
  return new RegExp(
    `\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  ).test(haystack);
}

export type ClubMatch =
  | { status: 'exact' | 'fuzzy'; clubId: string; clubName: string }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'none' };

export type ClubMatcher = (displayName: string) => ClubMatch;

export function buildClubMatcher(clubs: CsvClub[]): ClubMatcher {
  const bySport = clubs.filter((c) => c.sport === 'rugby');
  const normalizedIndex = bySport.map((c) => ({
    club: c,
    normalized: normalize(c.name),
  }));
  const normalizedAliases = Object.fromEntries(
    Object.entries(ALIASES).map(([key, value]) => [normalize(key), value]),
  );

  return (displayName: string): ClubMatch => {
    const normalizedDisplay = normalize(displayName);

    const alias = normalizedAliases[normalizedDisplay];
    if (alias) {
      const aliased = normalizedIndex.find(
        (c) => c.normalized === normalize(alias),
      );
      if (aliased)
        return {
          status: 'exact',
          clubId: aliased.club.id,
          clubName: aliased.club.name,
        };
    }

    const exact = normalizedIndex.find(
      (c) => c.normalized === normalizedDisplay,
    );
    if (exact)
      return {
        status: 'exact',
        clubId: exact.club.id,
        clubName: exact.club.name,
      };

    const candidates = normalizedIndex.filter(
      (c) =>
        containsWhole(c.normalized, normalizedDisplay) ||
        containsWhole(normalizedDisplay, c.normalized),
    );

    if (candidates.length === 1) {
      return {
        status: 'fuzzy',
        clubId: candidates[0].club.id,
        clubName: candidates[0].club.name,
      };
    }
    if (candidates.length > 1) {
      return {
        status: 'ambiguous',
        candidates: candidates.map((c) => c.club.name),
      };
    }
    return { status: 'none' };
  };
}
