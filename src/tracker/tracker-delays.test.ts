import { describe, expect, it } from '@effect/vitest'
import { Effect, References } from 'effect'
import { TestClock } from 'effect/testing'
import { join } from 'node:path'
import { recordingDir } from './recording/layer'
import { stoppedCpu } from './report'
import { trackerLayer } from './runtime'
import type { Snapshot, SnapshotTrip } from './snapshot'
import { loadTimetable } from './timetable'
import { Tracker } from './tracker'

// SIRI-ET's delays in the opened vehicle and stop (spec #146, #214): the timetable source with
// `MYLDER_UPDATES=recording:siri-et`, its reader inside the tracker over the recording's messages.
// A trip's answer and its stops' rows keep the times its update gives each call, the times the map
// moves it on, not one delay for every call; and they say when the delays were last updated.

const RECORDING = 'siri-et'
const timetable = await loadTimetable(join(recordingDir(RECORDING), 'timetable'))

/** A moment on Saturday 31 October 2026, Copenhagen time (UTC+1). */
const cph = (time: string) => Date.parse(`2026-10-31T${time}+01:00`)

const onDelays = trackerLayer({
  timetable,
  source: { kind: 'timetable' },
  updates: { kind: 'recording', folder: RECORDING },
  cpu: stoppedCpu,
})

/** The snapshot at a moment, Copenhagen time, its run's log line kept quiet. */
const snapshotAt = (time: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(cph(time))
    return yield* (yield* Tracker).getSnapshot
  }).pipe(Effect.provideService(References.MinimumLogLevel, 'Warn'))

/** The trip of a line whose first call is at `departs`, Copenhagen time, on the service day. */
const tripOf = (snapshot: Snapshot, line: string, departs: string): SnapshotTrip => {
  const trip = timetable
    .tripsOn('2026-10-31')
    .find((each) => each.line.name === line && each.calls[0].departure === cph(departs))
  return snapshot.trips.find((each) => each.key === trip?.key)!
}

/** The planned calls of a snapshot trip. */
const planned = (trip: SnapshotTrip) =>
  timetable.tripsOn('2026-10-31').find((each) => each.key === trip.key)!.calls

describe('SIRI-ET’s delays in the opened vehicle and stop', () => {
  it.effect('times an opened trip’s calls as its update does, as the map moves it', () =>
    Effect.gen(function* () {
      // Bus 68 of 09:03, a whole trip from its first message: 1 to 3 min early by call, and 2 min
      // early at its last step, the snapshot's delay.
      const snapshot = yield* snapshotAt('09:02:00')
      const bus = tripOf(snapshot, '68', '09:03')
      expect(bus.delay).toBe(-120)
      const detail = (yield* (yield* Tracker).getTripDetail(bus.key))!
      // Each next call at the time the map moves the bus to it.
      for (const next of bus.next) {
        expect(detail.calls[next.index].expectedDeparture).toBe(next.time)
      }
      const calls = planned(bus)
      const delays = new Set(
        detail.calls.map((call, i) => (call.expectedDeparture! - calls[i].departure) / 1000),
      )
      expect([...delays].sort()).toEqual([-120, -180, -60].sort())
      expect(detail.source).toEqual({ kind: 'timetable', delaysUpdated: bus.updated })
    }).pipe(Effect.provide(onDelays)),
  )

  it.effect('gives a stop’s departure of an updated trip the time its update gives that call', () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotAt('09:02:00')
      const bus = tripOf(snapshot, '68', '09:03')
      const tracker = yield* Tracker
      const detail = (yield* tracker.getTripDetail(bus.key))!
      // The calls in the next 30 minutes where the update's delay isn't the trip's last, -2 min.
      const calls = planned(bus)
      const apart = detail.calls.filter(
        (call, i) =>
          i < calls.length - 1 &&
          call.expectedDeparture! < cph('09:32:00') &&
          call.expectedDeparture! - calls[i].departure !== bus.delay! * 1000,
      )
      expect(apart.length).toBeGreaterThan(0)
      for (const call of apart) {
        const stop = (yield* tracker.getStopDepartures(call.stop))!
        const row = stop.departures.find((each) => each.trip === bus.key)
        expect(row?.expected).toBe(call.expectedDeparture)
        expect(row?.state).toBe('estimated')
        expect(stop.source).toEqual({
          kind: 'timetable',
          delaysUpdated: snapshot.updates.lastMessage,
        })
      }
    }).pipe(Effect.provide(onDelays)),
  )
})
