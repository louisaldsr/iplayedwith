/** "BRYAN arnaud" -> "Bryan Arnaud" — capitalizes after spaces, apostrophes, and hyphens. */
export function titleCase(str: string): string {
  return str.toLowerCase().replace(/(^|[\s'-])([a-zà-öø-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase())
}
