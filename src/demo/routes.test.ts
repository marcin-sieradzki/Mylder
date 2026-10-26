import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startingAt } from '../tracker/recording/clock.ts'
import { readStart, recordingDir } from '../tracker/recording/layer.ts'
import type { Snapshot } from '../tracker/snapshot.ts'
import { demoRoutes, type ReadTimetableFile } from './routes.ts'

// The demo's routes on the weekday recording's timetable, at the recording's moment: the tracker
// runs on the simulated Rejseplanen, as in the worker, and reads its files the way it is given.
const dir = recordingDir('weekday')
const VERSION = '2026-06-02-4f2b8119'
const start = await readStart(dir)
const fromDisk: ReadTimetableFile = (file) => readFile(join(dir, 'timetable', file), 'utf8')
const route = demoRoutes({ read: fromDisk, beneath: startingAt(start) })

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

  it('answer 404 for any other path', async () => {
    expect((await route('/api/nothing')).status).toBe(404)
    expect((await route('/elsewhere')).status).toBe(404)
  })

  it('try the timetable again on the next ask after a read fails', async () => {
    let fail = true
    const flaky = demoRoutes({
      read: (file) => (fail ? Promise.reject(new Error('offline')) : fromDisk(file)),
      beneath: startingAt(start),
    })
    await expect(flaky('/api/timetable')).rejects.toThrow('offline')
    expect((await flaky('/api/snapshot')).status).toBe(503)
    fail = false
    expect((await flaky('/api/snapshot')).status).toBe(200)
  })
})
