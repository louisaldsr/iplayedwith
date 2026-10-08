/**
 * Jolpica (Ergast) gives a driver's nationality as an English demonym — "British", "Monegasque",
 * "East German" — not a country code. This maps each one to the alpha-2 code `Nationality` takes.
 *
 * A demonym of a state that no longer exists goes to its successor: Rhodesian → ZW, East German →
 * DE. A double one ("American-Italian") keeps the first nation, the one the sources lead with. A
 * demonym missing here leaves the driver without a flag; the build warns about it.
 */
const DEMONYM_TO_ALPHA2: Record<string, string> = {
  American: 'US',
  'American-Italian': 'US',
  Argentine: 'AR',
  'Argentine-Italian': 'AR',
  Argentinian: 'AR',
  Australian: 'AU',
  Austrian: 'AT',
  Belgian: 'BE',
  Brazilian: 'BR',
  British: 'GB',
  Canadian: 'CA',
  Chilean: 'CL',
  Chinese: 'CN',
  Colombian: 'CO',
  Czech: 'CZ',
  Danish: 'DK',
  Dutch: 'NL',
  'East German': 'DE',
  Estonian: 'EE',
  Finnish: 'FI',
  French: 'FR',
  German: 'DE',
  Greek: 'GR',
  'Hong Kong': 'HK',
  Hungarian: 'HU',
  Indian: 'IN',
  Indonesian: 'ID',
  Irish: 'IE',
  Israeli: 'IL',
  Italian: 'IT',
  Japanese: 'JP',
  Liechtensteiner: 'LI',
  Malaysian: 'MY',
  Mexican: 'MX',
  Monegasque: 'MC',
  'New Zealander': 'NZ',
  Norwegian: 'NO',
  Polish: 'PL',
  Portuguese: 'PT',
  Rhodesian: 'ZW',
  Russian: 'RU',
  'South African': 'ZA',
  Spanish: 'ES',
  Swedish: 'SE',
  Swiss: 'CH',
  Thai: 'TH',
  Turkish: 'TR',
  Uruguayan: 'UY',
  Venezuelan: 'VE',
}

/** The alpha-2 code for a Jolpica demonym, or null when it is not in the table above. */
export function alpha2OfDemonym(demonym: string): string | null {
  return DEMONYM_TO_ALPHA2[demonym.trim()] ?? null
}
