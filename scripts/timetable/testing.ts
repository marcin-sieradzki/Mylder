import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareTimetable, type PrepareOptions } from './prepare.ts'

// Runs the timetable job on the frozen fixture into a fresh folder, for tests.

/** A fixture's folder, by its name in `fixtures/`. */
export const fixtureDir = (name: string) => join(import.meta.dirname, 'fixtures', name)

export const FIXTURE = fixtureDir('gtfs')
export const FIXTURE_HASH = '4f2b8119f3dfa34ea89863353cd4980498fac8c75b37b293747f71ce5d3e3a62'

/**
 * The hash a fixture's version is named by: the real one's is its release's, and one made by
 * hand, such as `gtfs-crowded`, has the SHA-256 of its GTFS files in name order, so it never
 * shares a version with the real one, and a change to it names a new one.
 */
export async function fixtureHash(name: string): Promise<string> {
  if (name === 'gtfs') return FIXTURE_HASH
  const dir = fixtureDir(name)
  const hash = createHash('sha256')
  for (const file of (await readdir(dir)).filter((each) => each.endsWith('.txt')).sort()) {
    hash.update(file).update(await readFile(join(dir, file)))
  }
  return hash.digest('hex')
}

export async function prepareFixture(options: Partial<PrepareOptions> = {}) {
  const out = await mkdtemp(join(tmpdir(), 'mylder-timetable-'))
  const logs: string[] = []
  try {
    const { manifest } = await prepareTimetable({
      gtfs: FIXTURE,
      out,
      sourceHash: FIXTURE_HASH,
      preparedDate: '2026-06-02',
      log: (message) => logs.push(message),
      ...options,
    })
    const files = new Map<string, unknown>()
    for (const name of ['manifest.json', ...Object.values(manifest.files)]) {
      files.set(name, JSON.parse(await readFile(join(out, name), 'utf8')))
    }
    return { manifest, logs, read: (name: string) => files.get(name) }
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}
