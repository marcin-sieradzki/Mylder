import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { Aircraft } from '../tracker/aircraft/aircraft.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/snapshot.ts'
import { startingAt } from '../tracker/recording/clock.ts'
import {
  filesOnDisk,
  readJson,
  readStart,
  recordingDir,
  type RecordingFiles,
} from '../tracker/recording/layer.ts'
import type { Snapshot } from '../tracker/snapshot.ts'
import { demoAircraftLayer, demoRoutes, type ReadTimetableFile } from './routes.ts'

// The demo's routes on the weekday recording's timetable and planes, at the recording's moment:
// the tracker runs on the simulated Rejseplanen, as in the worker, and reads its files the way it
// is given; the planes replay the recording's aircraft answers in a loop.
const dir = recordingDir('weekday')
const VERSION = '2026-06-02-4f2b8119'
const start = await readStart(dir)
const fromDisk: ReadTimetableFile = (file) => readFile(join(dir, 'timetable', file), 'utf8')
const route = demoRoutes({ read: fromDisk, aircraft: { dir }, beneath: startingAt(start) })

/** The aircraft source's snapshot of each of the recording's aircraft answers, frozen from it. */
const answersDir = join(dir, 'answers', 'aircraft')
const saved = (await Promise.all(
  (await readdir(answersDir)).sort().map((file) => readJson(join(answersDir, file))),
)) as AircraftSnapshot[]

describe("the demo's routes", () => {
  it('answer the snapshot from the simulation, dated on the tracker’s clock', async () => {
    const response = await route('/api/snapshot')
    expect(response.status).toBe(200)
    expect(Date.parse(response.headers.get('Date')!)).toBeGreaterThanOrEqual(start - 1000)
    const snapshot = (await response.json()) as Snapshot
    expect(snapshot.source).toEqual({ kind: 'simulated', name: 'weekday' })
    expect(snapshot.trips.length).toBeGreaterThan(0)
  })

  it("answer a stop's departures, and 404 for a stop the timetable doesn't know", async () => {
    const network = (await (await route(`/api/timetable/${VERSION}/stops`)).json()) as {
      stops: { id: string; name: string }[]
    }
    const norreport = network.stops.find((stop) => stop.name === 'Nørreport St.')!
    const stop = await route(`/api/stops/${encodeURIComponent(norreport.id)}`)
    expect(stop.status).toBe(200)
    expect((await stop.json()) as object).toHaveProperty('departures')
    expect((await route('/api/stops/nowhere')).status).toBe(404)
  })

  it('answer the disruption list', async () => {
    const response = await route('/api/disruptions')
    expect(response.status).toBe(200)
    expect((await response.json()) as object).toHaveProperty('messages')
  })

  it("answer the current manifest and its version's files, never the trips", async () => {
    const manifest = (await (await route('/api/timetable')).json()) as { version: string }
    expect(manifest.version).toBe(VERSION)
    for (const file of ['manifest', 'stops', 'patterns', 'paths', 'dayProfiles']) {
      expect((await route(`/api/timetable/${VERSION}/${file}`)).status).toBe(200)
    }
    expect((await route(`/api/timetable/${VERSION}/trips`)).status).toBe(404)
    expect((await route('/api/timetable/2020-01-01-00000000/stops')).status).toBe(404)
  })

  it('answer the planes from the recording, as the aircraft source keeps its first answer', async () => {
    const response = await route('/api/aircraft')
    expect(response.status).toBe(200)
    expect(Date.parse(response.headers.get('Date')!)).toBeGreaterThanOrEqual(start - 1000)
    const snapshot = (await response.json()) as AircraftSnapshot
    expect(snapshot.provider).toBe('recording')
    expect(snapshot.aircraft).toEqual(saved[0].aircraft)
    expect(snapshot.aircraft.length).toBeGreaterThan(0)
  })

  it.effect(
    'replay the planes in a loop, each pass as fresh as the first: no age carries over',
    () =>
      Effect.gen(function* () {
        const aircraft = yield* Aircraft
        const calls = saved.length
        const PASS = calls * 10_000
        const served: AircraftSnapshot[] = []
        // A poll at each next due, for two passes and the start of a third.
        for (let call = 0; call < 2 * calls + 1; call++) {
          yield* TestClock.setTime(start + call * 10_000)
          served.push((yield* aircraft.getSnapshot)!)
        }
        expect(served.slice(0, calls)).toEqual(saved)
        const later = (snapshot: AircraftSnapshot, by: number): AircraftSnapshot => ({
          ...snapshot,
          fetched: snapshot.fetched + by,
          nextDue: snapshot.nextDue + by,
          lastAnswer: snapshot.lastAnswer! + by,
        })
        expect(served.slice(calls, 2 * calls)).toEqual(saved.map((each) => later(each, PASS)))
        expect(served[2 * calls]).toEqual(later(saved[0], 2 * PASS))
      }).pipe(Effect.provide(demoAircraftLayer({ dir }))),
  )

  it('answer 503 while the planes’ recording cannot be read, and read it again on the next ask', async () => {
    let malformed = true
    // The first aircraft file is a failure no recording can hold, until it is put right.
    const files: RecordingFiles = {
      list: filesOnDisk.list,
      read: async (path) =>
        malformed && path.endsWith('0001.json') ? { status: 'down' } : filesOnDisk.read(path),
    }
    const flaky = demoRoutes({
      read: fromDisk,
      aircraft: { dir, files },
      beneath: startingAt(start),
    })
    const failed = await flaky('/api/aircraft')
    expect(failed.status).toBe(503)
    malformed = false
    const answered = await flaky('/api/aircraft')
    expect(answered.status).toBe(200)
    expect(((await answered.json()) as AircraftSnapshot).aircraft).toEqual(saved[0].aircraft)
  })

  it('answer 404 for any other path', async () => {
    expect((await route('/api/nothing')).status).toBe(404)
    expect((await route('/elsewhere')).status).toBe(404)
  })

  it('answer a path with a broken escape as not found', async () => {
    expect((await route('/api/stops/%E0%A4%A')).status).toBe(404)
  })

  it('answer 503 while the timetable cannot be read, and try again on the next ask', async () => {
    let fail = true
    const flaky = demoRoutes({
      read: (file) => (fail ? Promise.reject(new Error('offline')) : fromDisk(file)),
      aircraft: { dir },
      beneath: startingAt(start),
    })
    const failed = await flaky('/api/snapshot')
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Retry-After')).toBe('30')
    expect((await flaky('/api/timetable')).status).toBe(503)
    expect((await flaky(`/api/timetable/${VERSION}/trips`)).status).toBe(404)
    fail = false
    expect((await flaky('/api/timetable')).status).toBe(200)
    expect((await flaky('/api/snapshot')).status).toBe(200)
  })
})
