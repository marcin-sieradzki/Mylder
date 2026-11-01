import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
// Saves a surface's visible text next to the journey's evidence, for the main/branch comparison.
export const dump = (journey: string, key: string, text: string) => {
  const dir = join('.verify', process.argv[2], journey)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'texts.json')
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  all[key] = text
  writeFileSync(file, JSON.stringify(all, null, 2))
}
