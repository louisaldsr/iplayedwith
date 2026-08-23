/** Maps a `scripts/input/players/{stem}.html` filename stem to its ISO alpha-2 nationality code. */
export const NATIONALITIES: Record<string, string> = {
  france: 'FR',
}

export function nationalityForStem(stem: string): string {
  const code = NATIONALITIES[stem.toLowerCase()]
  if (!code) throw new Error(`Unknown nationality stem "${stem}" — add it to scripts/lib/nationalities.ts`)
  return code
}
