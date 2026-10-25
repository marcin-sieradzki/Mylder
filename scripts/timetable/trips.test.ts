import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readDayProfiles } from '../../src/timetable/day-profiles.ts'
import { readPatterns } from '../../src/timetable/patterns.ts'
import { readStops } from '../../src/timetable/stops.ts'
import { expandServiceDay, readTrips } from '../../src/timetable/trips.ts'
import { FIXTURE, prepareFixture } from './testing.ts'

async function prepare(gtfs = FIXTURE) {
  const { manifest, read } = await prepareFixture({ gtfs })
  const patterns = readPatterns(read(manifest.files.patterns))
  const trips = readTrips(read(manifest.files.trips))
  return {
    manifest,
    patterns,
    stops: readStops(read(manifest.files.stops)),
    trips,
    dayProfiles: readDayProfiles(read(manifest.files.dayProfiles)),
    day: (day: string) => expandServiceDay(trips, patterns, day, manifest.timezone),
  }
}

const iso = (ms: number) => new Date(ms).toISOString()

describe('expanding a service day', () => {
  it('gives every trip that runs that day, with planned times for its calls', async () => {
    const { day, stops } = await prepare()

    const tuesday = day('2026-06-16')
    // All twenty trips run on Tuesday 2026-06-16 but Odense's light rail, which is cut.
    expect(tuesday).toHaveLength(19)

    const re = tuesday.find((t) => t.line.name === 'RE')!
    expect(re.number).toBe('002427')
    expect(re.serviceDay).toBe('2026-06-16')
    expect(stops.platforms[re.calls[0].platform].name).toBe('København H')
    expect(iso(re.calls[0].departure)).toBe('2026-06-16T05:17:00.000Z')
    expect(stops.platforms[re.calls.at(-1)!.platform].name).toBe('Næstved St.')
    expect(iso(re.calls.at(-1)!.arrival)).toBe('2026-06-16T06:22:00.000Z')
  })

  it('keeps the dwell between a call’s arrival and departure', async () => {
    const { day, stops } = await prepare()

    const a = day('2026-06-16').find((t) => t.line.name === 'A' && t.number === '611223')!
    const kobenhavnH = a.calls.find((c) => stops.platforms[c.platform].name === 'København H')!
    expect(iso(kobenhavnH.arrival)).toBe('2026-06-16T05:43:00.000Z')
    expect(iso(kobenhavnH.departure)).toBe('2026-06-16T05:44:00.000Z')
  })

  it('drops a trip on a date calendar_dates cancels it', async () => {
    const { day } = await prepare()

    const harbourBuses = (date: string) => day(date).filter((t) => t.line.name === '991')
    expect(harbourBuses('2026-06-04')).toHaveLength(2)
    expect(harbourBuses('2026-06-05')).toHaveLength(0)
  })

  it('puts a trip after midnight in the service day before', async () => {
    const { day } = await prepare()

    const late = day('2026-06-16').find((t) => t.line.name === 'A' && t.headsign === 'København H')!
    expect(late.serviceDay).toBe('2026-06-16')
    // 24:11 on the Tuesday is 00:11 on Wednesday in Copenhagen's summer time.
    expect(iso(late.calls[0].departure)).toBe('2026-06-16T22:11:00.000Z')
    expect(late.key).toContain('20260616')
    // The trip runs Monday to Thursday, so Friday's service day has none.
    expect(day('2026-06-19').some((t) => t.headsign === 'København H')).toBe(false)
  })

  it("keeps the Metro's planned departures as single trips", async () => {
    const { day } = await prepare()

    const m1 = day('2026-06-16')
      .filter((t) => t.line.name === 'M1')
      .map((t) => `${t.headsign} ${iso(t.calls[0].departure).slice(11, 16)}`)
      .sort()
    expect(m1).toEqual([
      'Vanløse St. (Metro) 05:01',
      'Vanløse St. (Metro) 05:05',
      'Vestamager St. (Metro) 05:03',
      'Vestamager St. (Metro) 05:07',
    ])
  })

  it('gives each trip a key from its mode, line, pattern, service day and first departure', async () => {
    const { day, patterns } = await prepare()

    const trips = day('2026-06-16')
    const re = trips.find((t) => t.line.name === 'RE')!
    expect(re.key).toBe(`train.RE.${patterns.patterns[re.pattern].key}.20260616.0717`)
    expect(new Set(trips.map((t) => t.key)).size).toBe(trips.length)
  })
})

describe('trip keys', () => {
  let renumbered: string
  beforeAll(async () => {
    renumbered = await mkdtemp(join(tmpdir(), 'mylder-renumbered-'))
    await cp(FIXTURE, renumbered, { recursive: true })
    // Give every trip a new GTFS id, as a new release does.
    const ids = new Map<string, string>()
    const renumber = (id: string) => {
      if (!ids.has(id)) ids.set(id, String(900000000 + ids.size * 7))
      return ids.get(id)!
    }
    const trips = await readFile(join(renumbered, 'trips.txt'), 'utf8')
    await writeFile(
      join(renumbered, 'trips.txt'),
      trips.replace(/^("[^"]*",\d+,)(\d+)/gm, (_, head: string, id: string) => head + renumber(id)),
    )
    const stopTimes = await readFile(join(renumbered, 'stop_times.txt'), 'utf8')
    await writeFile(
      join(renumbered, 'stop_times.txt'),
      stopTimes.replace(/^(\d+),/gm, (_, id: string) => `${renumber(id)},`),
    )
    if (ids.size !== 20) throw new Error(`renumbered ${ids.size} trips, not the fixture's 20`)
  })
  afterAll(async () => {
    await rm(renumbered, { recursive: true, force: true })
  })

  it('are unchanged when every GTFS trip_id is renumbered', async () => {
    const before = (await prepare()).day('2026-06-16').map((t) => t.key)
    const after = (await prepare(renumbered)).day('2026-06-16').map((t) => t.key)

    expect(after.sort()).toEqual(before.sort())
  })
})

describe('day profiles', () => {
  it('counts the trips underway at each quarter hour of each day', async () => {
    const { dayProfiles } = await prepare()

    // Counted by hand from the fixture's first departures and last arrivals.
    const expected = Array<number>(96).fill(0)
    expected[1] = expected[2] = expected[3] = 1 // Monday's A, 00:11 to 00:53
    expected[28] = 2 // 07:00
    expected[29] = 13
    expected[30] = expected[31] = expected[32] = 14
    expected[33] = 6
    expected[34] = expected[35] = 1 // the second harbour bus, until 08:49
    expect(dayProfiles.day('2026-06-16')).toEqual(expected)
  })

  it('covers every day of the window', async () => {
    const { dayProfiles, manifest } = await prepare()

    expect(dayProfiles.first).toBe(manifest.window.first)
    expect(dayProfiles.days).toHaveLength(87)
    expect(dayProfiles.day('2026-05-31')).toBeUndefined()
  })
})
