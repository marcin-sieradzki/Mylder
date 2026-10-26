import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readNetwork } from '../timetable/network.ts'
import type { Snapshot, SnapshotTrip } from '../tracker/index.ts'
import { whereOf } from './where.ts'

// Where a vehicle is, in the words its panel reads: on the weekday recording's own timetable, the
// fixture's real patterns and paths, with trips placed on them by hand.
const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): unknown => JSON.parse(readFileSync(join(recording, path), 'utf8'))
const manifest = read('timetable/manifest.json') as { files: Record<string, string> }
const network = readNetwork({
  manifest,
  stops: read(`timetable/${manifest.files.stops}`),
  patterns: read(`timetable/${manifest.files.patterns}`),
  paths: read(`timetable/${manifest.files.paths}`),
})
const minute2 = read('snapshots/0002.json') as Snapshot
const minute6 = read('snapshots/0006.json') as Snapshot
const FETCHED = minute2.fetched
const s = (seconds: number) => FETCHED + seconds * 1000

/** Line A towards Hillerød, Live at 07:21:00. */
const A_LIVE = minute2.trips.find((trip) => trip.key === 's-tog.A.0bc307e3eb.20260616.0707')!
const path = network.pathOf(A_LIVE.pattern)
const stops = path.stops

/** The A train with its position and next calls set by hand. */
const placed = (change: Partial<SnapshotTrip>): SnapshotTrip => ({ ...A_LIVE, ...change })

/** Calls a minute apart from 07:00:00 on, one per stop, standing no time at any. */
const minuteApart = stops.map((_, i) => {
  const time = s(-21 * 60 + i * 60)
  return { arrival: time, departure: time }
})

const where = (trip: SnapshotTrip, now: number, state: SnapshotTrip['state'] = trip.state) =>
  whereOf({ trip, state, fetched: FETCHED, path, calls: minuteApart, now })

describe('where a vehicle is', () => {
  it('is at a stop its position is on, or within 50 m of', () => {
    const at4 = placed({ progress: stops[4], next: [{ index: 5, stop: '', time: s(120) }] })
    expect(where(at4, FETCHED)).toEqual({ kind: 'at', stop: 4 })
    expect(where(placed({ ...at4, progress: stops[4] + 40 }), FETCHED)).toEqual({
      kind: 'at',
      stop: 4,
    })
    expect(where(placed({ ...at4, progress: stops[5] - 40 }), FETCHED)).toEqual({
      kind: 'at',
      stop: 5,
    })
  })

  it('is between the stop it left and the next, as its dot moves on', () => {
    const leaving = placed({ progress: stops[4], next: [{ index: 5, stop: '', time: s(120) }] })
    expect(where(leaving, s(60))).toEqual({ kind: 'between', from: 4, to: 5 })
    // The dot reaches the next stop at its time.
    expect(where(leaving, s(120))).toEqual({ kind: 'at', stop: 5 })
  })

  it('is at its last stop once it gets there', () => {
    const last = stops.length - 1
    const arriving = placed({ progress: stops[last], next: [] })
    expect(where(arriving, s(60))).toEqual({ kind: 'at', stop: last })
  })

  it('is at its first or last stop while its position is short of the one or past the other', () => {
    // A path that runs 100 m before its first stop and 500 m past its last.
    const longer = { points: [], distances: [], stops: [100, 1000, 2000], length: 2500 }
    const at = (progress: number) =>
      whereOf({
        trip: placed({ progress, next: [] }),
        state: 'live',
        fetched: FETCHED,
        path: longer,
        calls: [],
        now: FETCHED,
      })
    expect(at(0)).toEqual({ kind: 'at', stop: 0 })
    expect(at(2400)).toEqual({ kind: 'at', stop: 2 })
  })

  it('is Waiting at its first stop, with its departure, never at it', () => {
    const waiting = minute6.trips.find((trip) => trip.key === 'bus.991.7ce514fd98.20260616.0730')!
    expect(
      whereOf({
        trip: waiting,
        state: waiting.state,
        fetched: minute6.fetched,
        path: network.pathOf(waiting.pattern),
        calls: [],
        now: minute6.fetched,
      }),
    ).toEqual({ kind: 'waiting', stop: 0, departs: Date.UTC(2026, 5, 16, 5, 30) })
  })

  it('is last seen near the stop where its times put it when an answer last carried it', () => {
    // Seen at 07:03:00, on the calls at stop 3; at 07:03:24, 40% of the way to stop 4; at
    // 07:03:42, 70% of the way.
    const seenAt = (at: number) => placed({ seen: at, progress: stops[10] })
    const seen = (seconds: number) => s(-18 * 60 + seconds)
    expect(where(seenAt(seen(0)), FETCHED, 'no-signal')).toEqual({ kind: 'near', stop: 3 })
    expect(where(seenAt(seen(24)), FETCHED, 'no-signal')).toEqual({ kind: 'near', stop: 3 })
    expect(where(seenAt(seen(42)), FETCHED, 'no-signal')).toEqual({ kind: 'near', stop: 4 })
  })

  it('is last seen where the snapshot put it, when that snapshot last carried it', () => {
    const now = placed({ progress: stops[6] + 10, seen: FETCHED })
    expect(where(now, s(400), 'no-signal')).toEqual({ kind: 'near', stop: 6 })
  })
})
