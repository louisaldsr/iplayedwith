import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_DELAY_MS = 300
const USER_AGENT = 'Mozilla/5.0 (compatible; iplayedwith-seed-script/1.0)'

/**
 * Fetches `url` and caches the response body at `cachePath`. Cache hits are
 * returned immediately with no delay; a live fetch is followed by a polite
 * pause so a ~1600-player run doesn't hammer allrugby.com.
 */
export async function fetchWithCache(url: string, cachePath: string, delayMs = DEFAULT_DELAY_MS): Promise<string> {
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8')
  }

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`)
  const html = await res.text()

  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, html, 'utf8')

  await new Promise((resolve) => setTimeout(resolve, delayMs))
  return html
}
