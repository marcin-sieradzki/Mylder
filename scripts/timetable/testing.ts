import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareTimetable, type PrepareOptions } from './prepare.ts'

// Runs the timetable job on the frozen fixture into a fresh folder, for tests.

export const FIXTURE = join(import.meta.dirname, 'fixtures', 'gtfs')
export const FIXTURE_HASH = '4f2b8119f3dfa34ea89863353cd4980498fac8c75b37b293747f71ce5d3e3a62'

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
