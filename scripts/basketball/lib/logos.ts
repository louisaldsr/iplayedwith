/** Basketball-Reference's crest files, and where the cleaned copies are served (seedLogos.ts). */

/** `https://cdn.ssref.net/req/…/tlogo/bbr/BOS-1986.png` → `BOS-1986.png`. */
export function logoFileName(sourceUrl: string): string {
  const name = sourceUrl.split('/').pop() ?? ''
  if (!/^[A-Z0-9]+-\d{4}\.png$/.test(name)) throw new Error(`Unexpected Basketball-Reference logo URL: ${sourceUrl}`)
  return name
}

/** Where the cleaned crest is served from — `public/logos/basketball/`, a path the app loads as-is. */
export const publicLogoUrl = (fileName: string) => `/logos/basketball/${fileName}`
