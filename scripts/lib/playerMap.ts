import fs from 'node:fs'
import path from 'node:path'

/** Step 1 (mapPlayers.ts) output — one entry per discovered allrugby player. */
export type PlayerMapEntry = { name: string; nationality: string | null; profileUrl: string }
export type PlayerMap = Record<string, PlayerMapEntry>

/** Step 2 (seedPlayers.ts) output — tracks whether each mapped player has been created in the DB. */
export type SeededStatus = 'saved' | 'rejected' | 'failure' | 'manual check'
export type SeededMapEntry = {
  status: SeededStatus
  name: string
  nationality: string | null
  profileUrl: string
  playerId?: string
  reason?: string
}
export type SeededMap = Record<string, SeededMapEntry>

export function loadJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

export function saveJson<T>(filePath: string, data: T) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}
