import { writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
export const dump = (key: string, value: unknown) => {
  const run = process.argv[2]
  const name = basename(process.argv[3]).replace(/\.ts$/, '')
  const dir = join('.verify', run, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${key}.txt`), typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}
