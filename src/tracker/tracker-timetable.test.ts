import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Logger } from 'effect'
import { TestClock } from 'effect/testing'
import { SPENT_AT } from './budget'
import { callsKey } from './rejseplanen/client'
import { keyPrefixOf, trackerLayer } from './runtime'
import type { Snapshot } from './snapshot'
import { readSource } from './source'
import { Store } from './store'
import { fixtureTimetable, startingAtMidnight } from './testing'
import type { Timetable } from './timetable'
import { Tracker, type PositionMode } from './tracker'

// The timetable source (spec #144): no call of any kind, every trip of the service day drawn from
// the timetable as Timetable only. Its API layer, the one production runs, refuses every request
// and fails it, so every test here also proves that nothing called it.

/** 07:20:30 in Copenhagen on Tuesday 2026-06-16, when the fixture has trips underway. */
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)

/** 23:50 in Copenhagen on Tuesday 2026-06-16: Wednesday's service day starts at midnight. */
const NIGHT = Date.UTC(2026, 5, 16, 21, 50)

const fixture = await fixtureTimetable()
const night = startingAtMidnight(fixture, '2026-06-17')
const timetableSource = readSource('timetable')

interface Logged {
  readonly level: string
  readonly message: unknown
}

/** The tracker on the timetable source, with every log it writes kept in `logged`. */
const onTimetable = (
  options: { timetable?: Timetable; positionMode?: PositionMode; logged?: Logged[] } = {},
) =>
  Layer.merge(
    trackerLayer({
      timetable: options.timetable ?? fixture,
      source: timetableSource,
      positionMode: options.positionMode ?? 'alternating',
    }),
    Logger.layer([
      Logger.make(
        ({ logLevel, message }) => void options.logged?.push({ level: logLevel, message }),
      ),
    ]),
  )

const snapshot = Effect.gen(function* () {
  return yield* (yield* Tracker).getSnapshot
})

/** The snapshot of each minute from `from` for `minutes` minutes, as a watching browser asks. */
const everyMinute = (from: number, minutes: number) =>
  Effect.gen(function* () {
    const snapshots: Snapshot[] = []
    for (let minute = 0; minute < minutes; minute++) {
      yield* TestClock.setTime(from + minute * 60_000)
      snapshots.push(yield* snapshot)
    }
    return snapshots
  })

/** Everything a snapshot on the timetable source says, whatever the moment. */
const expectTimetableOnly = (s: Snapshot) => {
  expect(s).toMatchObject({
    source: { kind: 'timetable' },
    positionMode: 'none',
    api: { status: 'ok' },
    budget: { level: 'normal', calls: 0 },
    lastSeen: {},
    disruptions: null,
    pollInterval: 60,
  })
  expect(s.answerMode).toBeUndefined()
  expect(s.apiTime).toBeUndefined()
  expect(s.status.calls).toEqual([])
  for (const trip of s.trips) {
    expect(trip).toMatchObject({ state: 'timetable-only', source: 'timetable', hadRealtime: false })
    expect(trip.delay).toBeUndefined()
    expect(trip.seen).toBeUndefined()
  }
}

/** The fixture's night S-tog, from 00:11 to 00:53 after Tuesday's service day. */
const NIGHT_TRAIN = 's-tog.A.cd4435aeea.20260616.2411'

describe('the tracker on the timetable source', () => {
  it.effect('draws every trip as Timetable only with no call, minute after minute', () =>
    Effect.gen(function* () {
      const snapshots = yield* everyMinute(MOMENT, 6)
      for (const s of snapshots) expectTimetableOnly(s)
      const [first] = snapshots
      expect(first.trips.length).toBeGreaterThanOrEqual(17)
      expect(new Set(first.trips.map((trip) => trip.mode))).toEqual(
        new Set(['bus', 'metro', 's-tog', 'train']),
      )
      // The dots move along their patterns on their planned times.
      const later = snapshots.at(-1)!
      const moved = first.trips.filter((trip) => {
        const after = later.trips.find((each) => each.key === trip.key)
        return after && after.progress > trip.progress
      })
      expect(moved.length).toBeGreaterThan(10)
    }).pipe(Effect.provide(onTimetable())),
  )

  it.effect('reads position mode none whatever MYLDER_POSITION_MODE says', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      expectTimetableOnly(yield* snapshot)
    }).pipe(Effect.provide(onTimetable({ positionMode: 'REPORT_ONLY' }))),
  )

  it.effect('runs on through midnight and into the next service day', () =>
    Effect.gen(function* () {
      const snapshots = yield* everyMinute(NIGHT, 45)
      for (const s of snapshots) expectTimetableOnly(s)
      expect(snapshots[0].serviceDay).toBe('2026-06-16')
      expect(snapshots.at(-1)!.serviceDay).toBe('2026-06-17')
      const days = new Set(
        snapshots.flatMap((s) => s.trips.map((trip) => trip.key.split('.').at(-2))),
      )
      // Tuesday's night train and Wednesday's first trips, from midnight.
      expect(days).toEqual(new Set(['20260616', '20260617']))
    }).pipe(Effect.provide(onTimetable({ timetable: night }))),
  )

  it.effect(
    'shows a trip Waiting at its first stop 5 min before it leaves, gone once it arrives',
    () => {
      const trip = fixture.tripsOn('2026-06-16').find((each) => each.key === NIGHT_TRAIN)!
      const leaves = trip.calls[0].departure
      const arrives = trip.calls.at(-1)!.arrival
      const find = (s: Snapshot) => s.trips.find((each) => each.key === NIGHT_TRAIN)
      return Effect.gen(function* () {
        yield* TestClock.setTime(leaves - 6 * 60_000)
        expect(find(yield* snapshot)).toBeUndefined()
        yield* TestClock.setTime(leaves - 5 * 60_000)
        const waiting = find(yield* snapshot)
        expect(waiting).toMatchObject({
          state: 'timetable-only',
          waiting: true,
          progress: 0,
          next: [{ index: 0, time: leaves }, expect.anything(), expect.anything()],
        })
        yield* TestClock.setTime(arrives - 60_000)
        expect(find(yield* snapshot)).toMatchObject({ state: 'timetable-only' })
        expect(find(yield* snapshot)?.waiting).toBeUndefined()
        yield* TestClock.setTime(arrives)
        expect(find(yield* snapshot)).toBeUndefined()
      }).pipe(Effect.provide(onTimetable()))
    },
  )

  it.effect('answers a stop and a trip from the timetable, with no delay and no call', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const tracker = yield* Tracker
      const s = yield* tracker.getSnapshot
      // Nørreport, with buses and S-tog in the next half hour.
      const stop = (yield* tracker.getStopDepartures('27532'))!
      expect(stop.source).toEqual({ kind: 'timetable' })
      expect(stop.departures.length).toBeGreaterThan(0)
      for (const row of stop.departures) {
        expect(row.expected).toBeUndefined()
        expect(row.state).toBe('timetable-only')
      }
      const arrivals = (yield* tracker.getStopArrivals('27532'))!
      expect(arrivals.source).toEqual({ kind: 'timetable' })
      for (const row of arrivals.arrivals) expect(row.expected).toBeUndefined()
      const opened = s.trips.find((trip) => trip.mode === 'bus')!
      const detail = (yield* tracker.getTripDetail(opened.key))!
      expect(detail).toMatchObject({ key: opened.key, source: { kind: 'timetable' } })
      expect(detail.delay).toBeUndefined()
      for (const call of detail.calls) {
        expect(call.expectedArrival).toBeUndefined()
        expect(call.expectedDeparture).toBeUndefined()
      }
      // A minute on, the next run still counts no call.
      yield* TestClock.adjust('60 seconds')
      expectTimetableOnly(yield* tracker.getSnapshot)
    }).pipe(Effect.provide(onTimetable())),
  )

  it.effect('logs no error: its API layer, which refuses every request, is never reached', () => {
    const logged: Logged[] = []
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const tracker = yield* Tracker
      for (let minute = 0; minute < 3; minute++) {
        const s = yield* tracker.getSnapshot
        yield* tracker.getStopDepartures('27532')
        yield* tracker.getStopArrivals('27532')
        yield* tracker.getTripDetail(s.trips[0].key)
        yield* tracker.getDisruptions
        yield* TestClock.adjust('60 seconds')
      }
      expect(logged.filter(({ level }) => level !== 'Info')).toEqual([])
    }).pipe(Effect.provide(onTimetable({ logged })))
  })

  it.effect(
    'logs each run with no calls, the trips by mode and state, and the timetable age',
    () => {
      const logged: Logged[] = []
      return Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        const s = yield* snapshot
        const lines = logged.flatMap(({ message }) =>
          Array.isArray(message) && message[0] === 'Tracker run' ? [message[1] as unknown] : [],
        )
        expect(lines).toEqual([
          expect.objectContaining({
            source: { kind: 'timetable' },
            positionMode: 'none',
            budget: { level: 'normal', calls: 0 },
            calls: [],
            modes: s.status.modes,
            states: { 'timetable-only': s.trips.length },
            timetable: { prepared: '2026-06-02', last: '2026-08-26', daysLeft: 72, daysOld: 14 },
          }),
        ])
        expect(s.status.modes).toEqual({
          bus: s.trips.filter((trip) => trip.mode === 'bus').length,
          metro: s.trips.filter((trip) => trip.mode === 'metro').length,
          's-tog': s.trips.filter((trip) => trip.mode === 's-tog').length,
          train: s.trips.filter((trip) => trip.mode === 'train').length,
        })
      }).pipe(Effect.provide(onTimetable({ logged })))
    },
  )

  it.effect(
    'runs as a healthy run with no calls even when its store reads the month as spent',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        // A counter no run on this source writes, set as a spent month's would be.
        yield* (yield* Store).set(callsKey(keyPrefixOf(timetableSource), '2026-06'), SPENT_AT)
        const s = yield* snapshot
        expect(s.api).toEqual({ status: 'ok', since: MOMENT })
        expect(s.status.calls).toEqual([])
        for (const trip of s.trips) expect(trip.state).toBe('timetable-only')
      }).pipe(Effect.provide(onTimetable())),
  )

  it('keeps its store keys apart from every other source’s', () => {
    const prefixes = ['rejseplanen', 'simulated', 'simulated:spent', 'recording:weekday'].map(
      (setting) => keyPrefixOf(readSource(setting)),
    )
    expect(keyPrefixOf(timetableSource)).toBe('mylder:timetable')
    expect(prefixes).not.toContain(keyPrefixOf(timetableSource))
  })
})
