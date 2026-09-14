/** Competitions with no useful data for this game — the whole row is dropped, never becomes a membership. */
const DROPPED_COMPETITIONS = new Set(['NPC', 'Nationale', 'Champ Rugby']);

/**
 * Pan-European club competitions. `parseCareerRows` keeps only the first competition
 * row per season+club (usually the domestic league), but that assumption doesn't always
 * hold — sometimes the European competition ends up recorded instead. When it does, we
 * rewrite it to the club's actual domestic league via `DOMESTIC_LEAGUE_BY_CLUB_ID`.
 */
const EUROPEAN_COMPETITIONS = new Set([
  'Challenge Cup',
  'H Cup',
  'H CUP',
  'Champions Cup',
  'Anglo Welsh Cup',
]);

/**
 * clubId -> domestic league, for every club currently playing in Europe (Champions Cup /
 * Challenge Cup) — i.e. Top 14, United Rugby Championship, and Premiership clubs. Other
 * clubs in clubs.csv (Super Rugby, French ProD2/Nationale, etc.) never play in Europe, so
 * they never need a European-competition row rewritten and are intentionally left out.
 *
 * Sourced from scripts/input/clubs.csv; Top 14 membership cross-checked against the live
 * allrugby.com mutations-top14.html club list. Reflects the 2026/2027 season composition —
 * update on promotion/relegation.
 */
const DOMESTIC_LEAGUE_BY_CLUB_ID: Record<string, string> = {
  // Top 14
  '038ee390-2d87-441d-a1af-796aa3f96442': 'Top 14', // Aviron Bayonnais
  '630bd9a3-0717-4daf-9f04-1ddf3c16de4c': 'Top 14', // Union Bordeaux-Bègles
  'bf1182ab-e794-422b-b031-5703da1df3fe': 'Top 14', // Castres Olympique
  '5d8004d6-378b-4140-9d6f-9816355f0f9a': 'Top 14', // ASM Clermont
  '36cf16dd-dd1f-476b-a182-7b11e327d53a': 'Top 14', // Stade Rochelais
  'f3959302-0cde-4947-b958-9bc10c542876': 'Top 14', // Lyon OU Rugby
  '370c0640-114d-43bf-9cc2-16d0e2a6e053': 'Top 14', // US Montauban
  '57428006-d37f-4b16-abf3-e28b313f4470': 'Top 14', // Montpellier Hérault Rugby
  '4dff43e9-a706-411d-9ab5-d6111802dd93': 'Top 14', // Stade Français Paris
  '261c8e2d-cbf3-4030-9839-e953ae82b30f': 'Top 14', // Section Paloise
  '9aedb7ac-d1ae-4508-9612-f47e0ee15ad5': 'Top 14', // USA Perpignan
  '5dfcc849-43f2-4197-88a5-42fd987136c5': 'Top 14', // Racing 92
  '9935845e-be24-4840-a9a4-b161625edb1b': 'Top 14', // RC Toulon
  '3e6f0ad3-1942-43ff-8b47-8b5b89c23a6d': 'Top 14', // Stade Toulousain
  '6a4a2783-5c0f-4ecc-b04f-608f29065bf2': 'Top 14', // RC Vannes
  '01718201-89ca-47e6-8123-4e5cbca0f181': 'Top 14', // Valence Romans
  '0e1f3c5a-8b6d-4f9e-9c3b-2f1e4d5a6b7c': 'Top 14', // Béziers
  '1ee8c254-b743-4306-b9cf-75234256203e': 'Top 14', // Rouen
  '45697340-8628-4f2b-b7b6-8ea591095ce3': 'Top 14', // Mont-de-Marsan
  '479873dc-90a5-478e-9007-78a502b11eeb': 'Top 14', // Angoulême
  '4c888935-abca-4a6f-ad2c-57b36fbb1767': 'Top 14', // Agen
  '57b0aa26-0c2b-4d95-9703-64b0f7fc942d': 'Top 14', // Dax
  '65f8dce7-8397-490d-9044-db1afa8c8031': 'Top 14', // Provence
  '7e1e8d89-02d6-4db2-b104-8906f552a9d5': 'Top 14', // Grenoble
  '99edf114-dfc4-43f9-9f5a-2ae5591880f3': 'Top 14', // Biarritz
  'ad7ce06f-0b3e-4b6a-bb18-733cef0bb6d8': 'Top 14', // Oyonnax
  'ca71d470-5040-4118-b11e-8cd32854a18a': 'Top 14', // Brive

  // United Rugby Championship
  '0ab8d02b-c092-424d-ac27-ae5d26a305a6': 'United Rugby Championship', // Ulster Rugby
  '775f1a70-1718-49f2-9745-a45d04d79049': 'United Rugby Championship', // Connacht Rugby
  '8794d072-665a-4aa0-bf68-b171cffe86d1': 'United Rugby Championship', // Munster Rugby
  'e75850a9-1ec1-4fe4-bcf0-fa1d603098fb': 'United Rugby Championship', // Leinster Rugby
  '28f0ea53-0d33-42d5-b3e9-929021e97120': 'United Rugby Championship', // Edinburgh Rugby
  '7ee9de18-8ba5-4837-bada-5a847a24c07d': 'United Rugby Championship', // Glasgow Warriors
  '680076e3-9247-41ab-879c-8548b9c32c22': 'United Rugby Championship', // Cardiff Rugby
  '8e53b97f-6e37-479b-8f24-607aabef6b8d': 'United Rugby Championship', // Scarlets
  'ee538f67-2dcc-48a1-83cd-1a1b21951c04': 'United Rugby Championship', // Ospreys
  'c71258f1-c045-4585-a04f-e5f7e9c4a8bd': 'United Rugby Championship', // Dragons RFC
  '5c33e130-92ba-4886-90b9-b3aeedd1bbb2': 'United Rugby Championship', // Benetton Rugby Treviso
  '4b261092-3240-4df9-a7b7-01e865fdc2c2': 'United Rugby Championship', // Zebre Parma
  '8d5e8d25-1485-44a4-a714-c88fe8ca11cb': 'United Rugby Championship', // Stormers
  'a7433b8b-8ec0-427f-9e47-18933aa9ec6a': 'United Rugby Championship', // Sharks Durban
  'a958aee0-7f5e-427f-8b14-6d933780783d': 'United Rugby Championship', // Lions
  'fe4d9b0a-d2d4-414f-a3e5-647317a31409': 'United Rugby Championship', // Bulls

  // Premiership (including Worcester Warriors / Wasps / London Irish — folded, but Premiership
  // clubs for the seasons they played, so still the correct rewrite for their historical rows)
  '0bfb6b66-ee11-47a2-a3c7-a4ab24d1c247': 'Premiership', // Northampton Saints
  '3220e183-eba7-4805-8fe5-8f28743f70de': 'Premiership', // Saracens Football Club
  '848d1a57-8d51-4d31-b954-3244fa7eb3b5': 'Premiership', // Sale Sharks
  '99abd556-bcf0-4e4f-92b3-b41cf6eec9d8': 'Premiership', // Bath Rugby
  '9425e830-813f-48e5-95b6-25055c6f697e': 'Premiership', // Harlequin Football Club
  'bc1d6285-063b-4c59-8b1c-c66a2524eab5': 'Premiership', // Leicester Tigers
  'b6aa91e5-20dd-457a-b2b6-12ec39126083': 'Premiership', // Bristol Bears
  'ca739345-c6c9-4cc5-bc57-425749031f4b': 'Premiership', // Exeter Chiefs
  '36d358f6-4b94-4e4b-85e0-1efdceeac915': 'Premiership', // Gloucester Rugby
  '8b902eca-d64c-412d-b001-bfb0b2fc1ec0': 'Premiership', // Newcastle Red Bulls
  '2cfc1b29-1c35-47bb-9e84-83e2ca6770a6': 'Premiership', // Worcester Warriors
  '3b1f1517-eb9c-4439-b8b5-b55f726bf171': 'Premiership', // Wasps
  '954bbac2-8f61-4c7e-8afd-e8a4259f8fc9': 'Premiership', // London Irish
};

/** True for a competition that should be dropped — the row is never turned into a membership. */
export function isDroppedCompetition(competition: string | undefined): boolean {
  return competition !== undefined && DROPPED_COMPETITIONS.has(competition);
}

/** Rewrites a pan-European competition (Challenge Cup / H Cup / Champions Cup) to the club's domestic league, when known; otherwise passes it through unchanged. */
export function resolveCompetition(
  clubId: string,
  competition: string | undefined,
): string | undefined {
  if (competition !== undefined && EUROPEAN_COMPETITIONS.has(competition)) {
    return DOMESTIC_LEAGUE_BY_CLUB_ID[clubId] ?? competition;
  }
  return competition;
}

/** True when a row's competition is pan-European but its club has no domestic-league mapping — `resolveCompetition` would leave it unrewritten, so callers should flag it for manual review instead of silently accepting the imprecise label. */
export function isUnmappedEuropeanCompetition(
  clubId: string,
  competition: string | undefined,
): boolean {
  return (
    competition !== undefined &&
    EUROPEAN_COMPETITIONS.has(competition) &&
    !(clubId in DOMESTIC_LEAGUE_BY_CLUB_ID)
  );
}
