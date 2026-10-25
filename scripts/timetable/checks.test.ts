import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareTimetable, type PrepareOptions } from './prepare.ts'
import { FIXTURE, FIXTURE_HASH } from './testing.ts'

let out: string
let broken: string
beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), 'mylder-out-'))
  broken = await mkdtemp(join(tmpdir(), 'mylder-broken-'))
  await cp(FIXTURE, broken, { recursive: true })
})
afterEach(async () => {
  await rm(out, { recursive: true, force: true })
  await rm(broken, { recursive: true, force: true })
})

function prepare(options: Partial<PrepareOptions> = {}) {
  return prepareTimetable({
    gtfs: FIXTURE,
    out,
    sourceHash: FIXTURE_HASH,
    preparedDate: '2026-06-02',
    ...options,
  })
}

/** Rewrites one file of the broken copy, line by line; `edit` returns undefined to drop a line. */
async function edit(file: string, change: (line: string, i: number) => string | undefined) {
  const path = join(broken, file)
  const lines = (await readFile(path, 'utf8')).split('\n')
  const kept = lines.map(change).filter((line) => line !== undefined)
  await writeFile(path, kept.join('\n'))
}

const listing = async () => (await readdir(out, { recursive: true })).sort()

describe('an unchanged feed', () => {
  it('exits with no change and writes nothing', async () => {
    const first = await prepare()
    const before = await readFile(join(out, 'manifest.json'), 'utf8')

    const again = await prepare({ preparedDate: '2026-06-09' })

    expect(again).toEqual({ changed: false, manifest: first.manifest })
    expect(await readFile(join(out, 'manifest.json'), 'utf8')).toBe(before)
    expect(await listing()).not.toContainEqual(expect.stringContaining('2026-06-09'))
  })
})

describe('a changed feed', () => {
  it('replaces the files of the release before', async () => {
    const first = await prepare()
    const second = await prepare({ sourceHash: 'ab'.repeat(32) })

    expect(second.changed).toBe(true)
    expect(await listing()).toEqual(
      ['2026-06-02-abababab', ...Object.values(second.manifest.files), 'manifest.json'].sort(),
    )
    expect(first.manifest.version).not.toBe(second.manifest.version)
  })
})

describe('the input checks', () => {
  it('fail on a feed without one of the expected files', async () => {
    await rm(join(broken, 'shapes.txt'))

    await expect(prepare({ gtfs: broken })).rejects.toThrow(/input.*shapes\.txt/i)
    expect(await listing()).toEqual([])
  })

  it('fail on a calendar that covers less than 14 days ahead', async () => {
    await expect(prepare({ preparedDate: '2026-08-20' })).rejects.toThrow(
      /input.*calendar.*2026-08-26.*14 days/i,
    )
    expect(await listing()).toEqual([])
  })

  it('fail when a file has a third fewer rows than the release before', async () => {
    await prepare()
    const before = await listing()
    // Drop eight of the twenty trips, and their calls with them.
    const dropped = new Set<string>()
    await edit('trips.txt', (line, i) => {
      const id = line.split(',')[2]
      if (i > 0 && i <= 8) return void dropped.add(id)
      return line
    })
    await edit('stop_times.txt', (line) => (dropped.has(line.split(',')[0]) ? undefined : line))

    await expect(
      prepare({ gtfs: broken, sourceHash: 'cd'.repeat(32), preparedDate: '2026-06-09' }),
    ).rejects.toThrow(/input.*trips\.txt.*12 rows.*20/i)
    expect(await listing()).toEqual(before)
  })
})

describe('the output checks', () => {
  it('fail on a trip without a shape', async () => {
    // The harbour bus's shape is gone, so its pattern has no path.
    await edit('shapes.txt', (line) => (line.startsWith('6327,') ? undefined : line))

    await expect(prepare({ gtfs: broken })).rejects.toThrow(/output.*no path.*991/i)
    expect(await listing()).toEqual([])
  })

  it('fail when the weekday has a third fewer trips than the release before', async () => {
    // Tuesday 2026-06-16 is the fixture's one weekday on which all its trips run.
    await prepare({ preparedDate: '2026-06-16' })
    const before = await listing()
    // A, E and 5C stop running on weekdays: eleven of a Tuesday's nineteen trips.
    await edit('calendar.txt', (line) =>
      /^(683|1584),/.test(line) ? line.replace(/,1,1,1,1,1,0,0,/, ',0,0,0,0,0,1,1,') : line,
    )

    await expect(
      prepare({ gtfs: broken, sourceHash: 'ef'.repeat(32), preparedDate: '2026-06-16' }),
    ).rejects.toThrow(/output.*2026-06-16.*8 trips.*19/i)
    expect(await listing()).toEqual(before)
  })
})
