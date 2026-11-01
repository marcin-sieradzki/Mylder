import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Logger, References } from 'effect'
import { TestClock } from 'effect/testing'
import { join } from 'node:path'
import { siriEtReader } from '../siri-et/reader'
import { readBox, readSiriEtMessages } from '../siri-et/recording'
import { UPDATE_TABLE_KEY, writeUpdateTable } from '../siri-et/store'
import type { UpdateTable } from '../siri-et/table'
import { recordingDir } from './recording/layer'
import { stoppedCpu } from './report'
import { trackerLayer } from './runtime'
import type { Snapshot, SnapshotTrip } from './snapshot'
import { Store } from './store'
import { loadTimetable } from './timetable'
import { Tracker } from './tracker'
import type { Updates } from './updates'

// SIRI-ET's delays on the map (spec #146, #213): the timetable source with `MYLDER_UPDATES` on the
// SIRI-ET recording, recordings/siri-et, whose reader runs inside the tracker over its messages at
// the test clock, joined to the trips of the recording's own timetable. Every expected delay is the
// reader's tests' (src/siri-et/reader.test.ts), read off the messages by hand.

const RECORDING = 'siri-et'
const timetable = await loadTimetable(join(recordingDir(RECORDING), 'timetable'))
const recorded: Updates = { kind: 'recording', folder: RECORDING }

/** A moment on Saturday 31 October 2026, Copenhagen time (UTC+1). */
const cph = (time: string) => Date.parse(`2026-10-31T${time}+01:00`)

/** The tracker on the timetable source with updates from `updates`. */
const onTimetable = (updates: Updates) =>
  trackerLayer({ timetable, source: { kind: 'timetable' }, updates, cpu: stoppedCpu })

/** The snapshot at a moment, Copenhagen time, its run's log line kept quiet. */
const snapshotAt = (time: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(cph(time))
    return yield* (yield* Tracker).getSnapshot
  }).pipe(Effect.provideService(References.MinimumLogLevel, 'Warn'))

/** The trip of a line whose first call is at `departs`, Copenhagen time, on the service day. */
const tripOf = (snapshot: Snapshot, line: string, departs: string): SnapshotTrip | undefined => {
  const trip = timetable
    .tripsOn('2026-10-31')
    .find((each) => each.line.name === line && each.calls[0].departure === cph(departs))
  return trip && snapshot.trips.find((each) => each.key === trip.key)
}

/** The planned call times of a snapshot trip, by call index. */
const planned = (trip: SnapshotTrip) =>
  timetable.tripsOn('2026-10-31').find((each) => each.key === trip.key)!.calls

describe('SIRI-ET’s delays from a recording, on the timetable source', () => {
  it.effect('gives a joined trip its update: Estimated, with its delay and expected calls', () =>
    Effect.gen(function* () {
      // Bus 68's first message, a whole trip of 30 calls from 09:03, 1 to 3 min early: 2 min
      // early from its first stop, 2256, and from Kigkurren's last step, 3153 at 09:42.
      const snapshot = yield* snapshotAt('09:02:00')
      const bus = tripOf(snapshot, '68', '09:03')
      expect(bus).toMatchObject({
        mode: 'bus',
        state: 'estimated',
        source: 'timetable',
        hadRealtime: true,
        delay: -120,
      })
      expect(bus?.updated).toBeLessThanOrEqual(cph('09:02:00'))
      // Placed from its timetable plus its delay: each next call 1 to 3 min ahead of its plan.
      const calls = planned(bus!)
      for (const next of bus!.next) {
        const late = (next.time - calls[next.index].departure) / 1000
        expect([-180, -120, -60]).toContain(late)
      }
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect(
    'marks the call a trip skips as cancelled, and serves it again when a message does',
    () =>
      Effect.gen(function* () {
        // Bus 68's Gyldenlandsvej (30090), due at 09:38, cancelled at 09:01 and served again at
        // 09:08:11.
        const before = tripOf(yield* snapshotAt('09:02:00'), '68', '09:03')
        const skipped = planned(before!).findIndex(
          (call) => call.departure === cph('09:38') || call.arrival === cph('09:38'),
        )
        expect(before?.cancelledCalls).toEqual([skipped])
        const after = tripOf(yield* snapshotAt('09:08:30'), '68', '09:03')
        expect(after?.cancelledCalls).toBeUndefined()
        expect(after?.state).toBe('estimated')
      }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('joins a train by its train number', () =>
    Effect.gen(function* () {
      // IC 50118's messages of 09:00:29, 09:03:41 and 09:06:52: 9 min late away from 8600501,
      // due at 09:05, and so through the stops its messages leave out, until 8600512 at 09:29.
      const snapshot = yield* snapshotAt('09:07:00')
      const trip = timetable.tripsOn('2026-10-31').find((each) => each.number === '050118')
      const ic = snapshot.trips.find((each) => each.key === trip?.key)
      expect(ic).toMatchObject({ mode: 'train', state: 'estimated', hadRealtime: true })
      const stopAt = (index: number) => timetable.stops.platforms[trip!.calls[index].platform].id
      expect(
        ic?.next.map((next) => [
          stopAt(next.index),
          (next.time - trip!.calls[next.index].departure) / 1000,
        ]),
      ).toEqual([
        ['8600501', 540],
        ['8600502', 540],
        ['8600503', 540],
      ])
      expect(ic?.next[0].time).toBe(cph('09:14'))
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('keeps a cancelled trip in the snapshot, marked, so the map leaves it out', () =>
    Effect.gen(function* () {
      // Bus 102A from 09:04: its last two calls cancelled at 09:19:32, the whole trip at 09:21:15.
      const before = tripOf(yield* snapshotAt('09:20:00'), '102A', '09:04')
      expect(before?.cancelled).toBeUndefined()
      expect(before?.cancelledCalls).toHaveLength(2)
      const after = tripOf(yield* snapshotAt('09:21:30'), '102A', '09:04')
      expect(after?.cancelled).toBe(true)
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('leaves every Metro trip Timetable only, and counts what has an update by mode', () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotAt('09:30:00')
      const metro = snapshot.trips.filter((trip) => trip.mode === 'metro')
      expect(metro.length).toBeGreaterThan(0)
      for (const trip of metro) {
        expect(trip).toMatchObject({ state: 'timetable-only', hadRealtime: false })
        expect(trip.updated).toBeUndefined()
      }
      const withUpdate = (mode: string) =>
        snapshot.trips.filter((trip) => trip.mode === mode && trip.updated !== undefined).length
      expect(snapshot.updates).toMatchObject({
        kind: 'recording',
        fresh: true,
        withUpdate: {
          bus: withUpdate('bus'),
          train: withUpdate('train'),
          's-tog': withUpdate('s-tog'),
        },
      })
      expect(snapshot.updates.withUpdate.metro).toBeUndefined()
      expect(snapshot.updates.lastMessage).toBeGreaterThan(cph('09:29:00'))
      expect(snapshot.updates.lastMessage).toBeLessThanOrEqual(cph('09:30:00'))
      // Nothing is Live or Ageing without positions.
      expect(snapshot.status.states.live).toBeUndefined()
      expect(snapshot.status.states.ageing).toBeUndefined()
      // Trips with no update stay Timetable only.
      expect(snapshot.status.states['timetable-only']).toBeGreaterThan(metro.length)
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('counts the journeys that join no trip, by mode', () =>
    Effect.gen(function* () {
      // Movia's line 19 runs between 56543 and 56444, and the timetable, cut to its box, has no
      // stop 56543, so no trip of the line starts or ends there.
      const snapshot = yield* snapshotAt('09:30:00')
      expect(snapshot.updates.unmatched.bus).toBeGreaterThan(0)
      expect(snapshot.updates.unmatched['s-tog']).toBeUndefined()
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('logs the unmatched journeys and each mode’s share of trips with an update', () => {
    const lines: unknown[] = []
    const kept = Logger.layer([
      Logger.make(({ message }) => {
        if (Array.isArray(message) && message[0] === 'Tracker run') lines.push(message[1])
      }),
    ])
    return Effect.gen(function* () {
      yield* TestClock.setTime(cph('09:30:00'))
      const snapshot = yield* (yield* Tracker).getSnapshot
      const { modes } = snapshot.status
      const { withUpdate, unmatched, lastMessage } = snapshot.updates
      // Two decimals of each mode's trips on the map: none of the Metro's.
      const share = (mode: string) =>
        Math.round(((withUpdate[mode] ?? 0) / modes[mode]) * 100) / 100
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({
        updates: {
          kind: 'recording',
          fresh: true,
          lastMessage,
          unmatched,
          share: {
            bus: share('bus'),
            metro: 0,
            's-tog': share('s-tog'),
            train: share('train'),
          },
        },
      })
      expect(share('bus')).toBeGreaterThan(0.3)
    }).pipe(Effect.provide(Layer.merge(onTimetable(recorded), kept)))
  })

  it.effect('names updates off, with nothing to count, when the switch is off', () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotAt('09:30:00')
      expect(snapshot.updates).toEqual({ kind: 'off', fresh: false, withUpdate: {}, unmatched: {} })
      for (const trip of snapshot.trips) expect(trip.state).toBe('timetable-only')
    }).pipe(Effect.provide(onTimetable({ kind: 'off' }))),
  )
})

describe('SIRI-ET’s delays from the listener’s table in the store', () => {
  /** The reader's table at a moment, Copenhagen time, as the listener would write it then. */
  const listenersTable = async (time: string) => {
    const dir = recordingDir(RECORDING)
    const [messages, box] = await Promise.all([
      readSiriEtMessages(join(dir, 'messages.jsonl.gz')),
      readBox(join(dir, 'timetable')),
    ])
    const reader = siriEtReader({ box, listener: { version: 'test', startedAt: cph('09:00:00') } })
    for (const message of messages) if (message.receivedAt <= cph(time)) reader.receive(message)
    // Through JSON, as the store keeps it.
    return JSON.parse(JSON.stringify(reader.table(cph(time)))) as UpdateTable
  }

  /** The snapshot at a moment with the store holding `table` under the table's key, if any. */
  const fromStore = (time: string, table?: unknown) =>
    Effect.gen(function* () {
      yield* TestClock.setTime(cph(time))
      const store = yield* Store
      if (table !== undefined) yield* store.set(UPDATE_TABLE_KEY, table, 600)
      return yield* snapshotAt(time)
    }).pipe(Effect.provide(onTimetable({ kind: 'siri' })))

  it.effect('gives the same trips as the reader inside the tracker, from one read a run', () =>
    Effect.gen(function* () {
      // Bus 102A of 09:04 cancelled whole at 09:21:15, beside every delay the table holds then.
      const table = yield* Effect.promise(() => listenersTable('09:21:30'))
      const written = yield* Effect.gen(function* () {
        yield* TestClock.setTime(cph('09:21:30'))
        yield* writeUpdateTable(yield* Store, table)
        return yield* snapshotAt('09:21:30')
      }).pipe(Effect.provide(onTimetable({ kind: 'siri' })))
      const replayed = yield* snapshotAt('09:21:30').pipe(Effect.provide(onTimetable(recorded)))
      expect(written.trips).toEqual(replayed.trips)
      expect(written.updates).toEqual({ ...replayed.updates, kind: 'siri' })
      expect(tripOf(written, '102A', '09:04')?.cancelled).toBe(true)
    }),
  )

  it.effect('leaves every trip Timetable only while the store holds no table', () =>
    Effect.gen(function* () {
      const snapshot = yield* fromStore('09:21:30')
      expect(snapshot.updates).toEqual({
        kind: 'siri',
        fresh: false,
        withUpdate: {},
        unmatched: {},
      })
      expect(new Set(snapshot.trips.map((trip) => trip.state))).toEqual(new Set(['timetable-only']))
    }),
  )

  it.effect('refuses a table of another version, as the schema says', () =>
    Effect.gen(function* () {
      const table = yield* Effect.promise(() => listenersTable('09:21:30'))
      const snapshot = yield* fromStore('09:21:30', { ...table, version: 2 })
      expect(snapshot.updates).toMatchObject({ kind: 'siri', fresh: false, withUpdate: {} })
      expect(snapshot.updates.lastMessage).toBeUndefined()
    }),
  )
})
