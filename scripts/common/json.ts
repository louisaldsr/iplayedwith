import fs from 'node:fs'
import path from 'node:path'

/** Reads a JSON file, returning `fallback` when it doesn't exist yet — how every pipeline step picks up where the previous run left off. */
export function loadJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

/** Writes a JSON file, creating its directory if needed. Trailing newline so the files stay diff-friendly. */
export function saveJson<T>(filePath: string, data: T) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}
