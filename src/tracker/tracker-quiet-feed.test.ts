import { describe, expect, it } from '@effect/vitest'
import { Clock, Effect, type Layer, References } from 'effect'
import { TestClock } from 'effect/testing'
import { join } from 'node:path'
import { dataCards } from '../domain/data-cards'
import { noSignalSince, updatesContext } from '../domain/data-state'
import { siriEtReader } from '../siri-et/reader'
import { readBox, readSiriEtMessages } from '../siri-et/recording'
import * as Http from './http'
import { recordingDir } from './recording/layer'
import { stoppedCpu } from './report'
import { trackerLayer } from './runtime'
import type { Snapshot, SnapshotTrip } from './snapshot'
import { loadTimetable } from './timetable'
import { Tracker } from './tracker'
import type { Updates } from './updates'

// A quiet SIRI-ET feed (spec #146, stories 19 to 21; #216): when SIRI-ET's messages stop for 5 min,
// every trip that had an update turns No signal from the last message's time and keeps moving on
// its timetable plus its last delay, with Mylder's `updates-stale` card; at the next message the
// card goes and the states come back. On the timetable source, over recordings/siri-et, whose
// messages end at 09:56:07.521 Copenhagen time.

const RECORDING = 'siri-et'
const timetable = await loadTimetable(join(recordingDir(RECORDING), 'timetable'))

/** A moment on Saturday 31 October 2026, Copenhagen time (UTC+1). */
const cph = (time: string) => Date.parse(`2026-10-31T${time}+01:00`)

/** Room for a test that replays the recording's messages, slow while the whole suite runs. */
const REPLAY_TIMEOUT = 30_000

/** The recording's last message. */
const LAST_MESSAGE = cph('09:56:07.521')

/** The snapshot at a moment, Copenhagen time, its run's log line kept quiet. */
const snapshotAt = (time: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(cph(time))
    return yield* (yield* Tracker).getSnapshot
  }).pipe(Effect.provideService(References.MinimumLogLevel, 'Error'))

const withUpdate = (snapshot: Snapshot) =>
  snapshot.trips.filter((trip) => trip.updated !== undefined && !trip.cancelled)

const withoutUpdate = (snapshot: Snapshot) =>
  snapshot.trips.filter((trip) => trip.updated === undefined)

/** The planned call times of a snapshot trip, by call index. */
const planned = (trip: SnapshotTrip) =>
  timetable.tripsOn('2026-10-31').find((each) => each.key === trip.key)!.calls

/** How late each of a trip's next calls is due, in seconds, against its plan. */
const lateness = (trip: SnapshotTrip) => {
  const calls = planned(trip)
  return trip.next.map(({ index, time }) =>
    Math.round(
      (time - (index === calls.length - 1 ? calls[index].arrival : calls[index].departure)) / 1000,
    ),
  )
}

/** The cards the snapshot gives at its own moment. */
const cardsOf = (snapshot: Snapshot) => dataCards(snapshot, snapshot.fetched)

describe('a quiet SIRI-ET feed, replayed from the recording', () => {
  const recorded: Updates = { kind: 'recording', folder: RECORDING }
  const onTimetable = trackerLayer({
    timetable,
    source: { kind: 'timetable' },
    updates: recorded,
    cpu: stoppedCpu,
  })

  it.effect(
    'turns every trip with an update No signal 5 min after the last message, still moving on its delay, with the card',
    () =>
      Effect.gen(function* () {
        const before = yield* snapshotAt('10:00:30')
        expect(before.updates).toMatchObject({ lastMessage: LAST_MESSAGE, fresh: true })
        expect(cardsOf(before)).toEqual([])
        const estimated = withUpdate(before)
        expect(estimated.length).toBeGreaterThan(100)
        for (const trip of estimated) expect(trip.state).toBe('estimated')

        // The next run, over 5 min after the last message, with no other since.
        const quiet = yield* snapshotAt('10:01:31')
        expect(quiet.updates).toMatchObject({ lastMessage: LAST_MESSAGE, fresh: false })
        expect(cardsOf(quiet)).toEqual([{ kind: 'updates-stale', since: LAST_MESSAGE }])
        const silent = withUpdate(quiet)
        expect(silent.length).toBeGreaterThan(100)
        const context = updatesContext(quiet.updates)
        for (const trip of silent) {
          expect(trip.state).toBe('no-signal')
          expect(trip.hadRealtime).toBe(true)
          expect(noSignalSince(trip, context.updates)).toBe(LAST_MESSAGE)
        }
        // A trip without an update stays Timetable only.
        expect(withoutUpdate(quiet).length).toBeGreaterThan(100)
        for (const trip of withoutUpdate(quiet)) expect(trip.state).toBe('timetable-only')

        // Each keeps its last delay and moves on by it: two minutes on, it is further along,
        // and its next calls are as late as its update made them.
        const later = yield* snapshotAt('10:03:31')
        expect(cardsOf(later)).toEqual([{ kind: 'updates-stale', since: LAST_MESSAGE }])
        let moved = 0
        for (const trip of silent) {
          const on = later.trips.find((each) => each.key === trip.key)
          if (!on || on.waiting || trip.waiting) continue
          expect(on.state).toBe('no-signal')
          expect(on.delay).toBe(trip.delay)
          expect(on.progress).toBeGreaterThanOrEqual(trip.progress)
          if (on.progress > trip.progress) moved++
          const shared = on.next.filter((call) => trip.next.some((was) => was.index === call.index))
          for (const call of shared) {
            expect(call.time).toBe(trip.next.find((was) => was.index === call.index)!.time)
          }
        }
        expect(moved).toBeGreaterThan(50)
        // A bus 6 min late at its next stops when the feed went quiet is still timed so.
        const late = silent.find(
          (trip) => trip.mode === 'bus' && lateness(trip).every((s) => s >= 300),
        )
        expect(late).toBeDefined()
      }).pipe(Effect.provide(onTimetable)),
    // The reader inside the tracker reads the recording's whole hour of messages.
    REPLAY_TIMEOUT,
  )
})

const TOKEN = 'a-test-token-of-the-listener-0123456789abcdef'
const LISTENER = { url: 'https://listener.example/table', token: TOKEN }

/**
 * A listener fed the recording's messages as they come, except that none reach it from
 * `stops` until `resumes`, when those held back arrive at once, as a subscription keeps them
 * (spec #146, "Restarts"). It builds its table at each request's moment; from `gone` on, it
 * doesn't answer at all.
 */
const pausedListener = async ({
  stops,
  resumes,
  gone,
}: {
  readonly stops: number
  readonly resumes: number
  readonly gone?: number
}): Promise<Layer.Layer<Http.HttpClient.HttpClient>> => {
  const dir = recordingDir(RECORDING)
  const [messages, box] = await Promise.all([
    readSiriEtMessages(join(dir, 'messages.jsonl.gz')),
    readBox(join(dir, 'timetable')),
  ])
  const reader = siriEtReader({ box, listener: { version: 'test', startedAt: cph('09:00:00') } })
  let next = 0
  return Http.layer(
    Http.client((request, url) =>
      Effect.gen(function* () {
        if (url.href !== LISTENER.url) return Http.text(request, 404, '')
        const now = yield* Clock.currentTimeMillis
        if (gone !== undefined && now >= gone) return yield* Http.unreachable(request)
        const through = now < stops || now >= resumes ? now : stops
        while (next < messages.length && messages[next].receivedAt <= through) {
          reader.receive(messages[next++])
        }
        return Http.json(request, 200, reader.table(now))
      }),
    ),
  )
}

const onListener = (http: Layer.Layer<Http.HttpClient.HttpClient>) =>
  trackerLayer({
    timetable,
    source: { kind: 'timetable' },
    updates: { kind: 'siri' },
    listener: LISTENER,
    updatesHttp: http,
    cpu: stoppedCpu,
  })

describe('a quiet SIRI-ET feed, from the listener’s table', () => {
  it.effect(
    'brings the states back and clears the card at the next message',
    () =>
      Effect.gen(function* () {
        const http = yield* Effect.promise(() =>
          pausedListener({ stops: cph('09:10:00'), resumes: cph('09:20:00') }),
        )
        yield* Effect.gen(function* () {
          const flowing = yield* snapshotAt('09:09:30')
          expect(flowing.updates.fresh).toBe(true)
          expect(cardsOf(flowing)).toEqual([])

          // The listener still answers, with a table built now, but its last message, from before
          // 09:10, ages.
          const quiet = yield* snapshotAt('09:15:30')
          const last = quiet.updates.lastMessage!
          expect(last).toBeLessThanOrEqual(cph('09:10:00'))
          expect(quiet.updates.fresh).toBe(false)
          expect(cardsOf(quiet)).toEqual([{ kind: 'updates-stale', since: last }])
          expect(withUpdate(quiet).length).toBeGreaterThan(50)
          for (const trip of withUpdate(quiet)) expect(trip.state).toBe('no-signal')
          for (const trip of withoutUpdate(quiet)) expect(trip.state).toBe('timetable-only')

          // The messages held back arrive: the card goes and every trip with an update is
          // Estimated again, at once.
          const back = yield* snapshotAt('09:20:00')
          expect(back.updates.fresh).toBe(true)
          expect(back.updates.lastMessage).toBeGreaterThan(cph('09:19:00'))
          expect(cardsOf(back)).toEqual([])
          expect(withUpdate(back).length).toBeGreaterThan(50)
          for (const trip of withUpdate(back)) expect(trip.state).toBe('estimated')
        }).pipe(Effect.provide(onListener(http)))
      }),
    // Each replays the recording's messages into a listener of its own, and can pass 5 s while
    // the whole suite runs.
    REPLAY_TIMEOUT,
  )

  it.effect(
    'keeps trips No signal on their last delay when the listener stops answering, not Timetable only',
    () =>
      Effect.gen(function* () {
        const http = yield* Effect.promise(() =>
          pausedListener({ stops: Infinity, resumes: Infinity, gone: cph('09:12:00') }),
        )
        yield* Effect.gen(function* () {
          const flowing = yield* snapshotAt('09:11:30')
          const last = flowing.updates.lastMessage!
          expect(flowing.updates.fresh).toBe(true)
          // One run without the table is no message yet for 5 min: the trips stay Estimated.
          const missed = yield* snapshotAt('09:12:30')
          expect(missed.updates).toMatchObject({ lastMessage: last, fresh: true })
          for (const trip of withUpdate(missed)) expect(trip.state).toBe('estimated')

          const quiet = yield* snapshotAt('09:17:00')
          expect(quiet.updates).toMatchObject({ lastMessage: last, fresh: false })
          expect(cardsOf(quiet)).toEqual([{ kind: 'updates-stale', since: last }])
          let compared = 0
          for (const trip of withUpdate(flowing)) {
            const on = quiet.trips.find((each) => each.key === trip.key)
            if (!on || on.waiting || trip.waiting) continue
            expect(on.state).toBe('no-signal')
            expect(on.delay).toBe(trip.delay)
            // It carries its last update's steps, which opened panels time its calls by.
            expect(on.steps).toEqual(trip.steps)
            // Its calls are still timed by its update, call by call.
            for (const call of on.next) {
              const was = trip.next.find((each) => each.index === call.index)
              if (was) {
                expect(call.time).toBe(was.time)
                compared++
              }
            }
          }
          expect(compared).toBeGreaterThan(50)
        }).pipe(Effect.provide(onListener(http)))
      }),
    // Each replays the recording's messages into a listener of its own, and can pass 5 s while
    // the whole suite runs.
    REPLAY_TIMEOUT,
  )
})

describe('a cancelled trip on a quiet SIRI-ET feed', () => {
  it.effect(
    'stays cancelled, with its skipped calls, through runs with no table and once the feed is quiet',
    () =>
      Effect.gen(function* () {
        // The listener answers until 09:23:00, then never again: one run without the table while
        // the feed is still fresh, then the feed quiet from 5 min after its last message.
        const http = yield* Effect.promise(() =>
          pausedListener({ stops: Infinity, resumes: Infinity, gone: cph('09:23:00') }),
        )
        yield* Effect.gen(function* () {
          const tracker = yield* Tracker
          const flowing = yield* snapshotAt('09:22:30')
          // Bus 102A of 09:22 is cancelled whole; bus 68 skips Otto Mønsteds Plads, stop 30090.
          const cancelled = flowing.trips.filter((trip) => trip.cancelled)
          const skipping = flowing.trips.filter((trip) => trip.cancelledCalls?.length)
          expect(cancelled.map((trip) => trip.line)).toContain('102A')
          expect(skipping.length).toBeGreaterThan(0)
          const marked = (snapshot: Snapshot) => ({
            cancelled: snapshot.trips.filter((trip) => trip.cancelled).map((trip) => trip.key),
            skipped: Object.fromEntries(
              snapshot.trips
                .filter((trip) => trip.cancelledCalls?.length)
                .map((trip) => [trip.key, trip.cancelledCalls]),
            ),
          })
          /** The departures at a stop the snapshot's cancellations mark, by trip. */
          const cancelledAt = (stop: string) =>
            tracker.getStopDepartures(stop).pipe(
              Effect.map((answer) =>
                (answer?.departures ?? [])
                  .filter((row) => row.cancelled)
                  .map((row) => row.trip)
                  .sort(),
              ),
            )
          const fændediget = yield* cancelledAt('5344')
          const ottoMønsteds = yield* cancelledAt('30090')
          expect(fændediget.length).toBeGreaterThan(0)
          expect(ottoMønsteds.length).toBeGreaterThan(0)

          for (const time of ['09:23:31', '09:28:32']) {
            const without = yield* snapshotAt(time)
            expect(without.updates.fresh).toBe(time === '09:23:31')
            // Every trip still on the map keeps its marks, and none is drawn again.
            const now = marked(without)
            for (const key of marked(flowing).cancelled) {
              if (without.trips.some((trip) => trip.key === key)) {
                expect(now.cancelled).toContain(key)
              }
            }
            for (const [key, calls] of Object.entries(marked(flowing).skipped)) {
              if (without.trips.some((trip) => trip.key === key)) {
                expect(now.skipped[key]).toEqual(calls)
              }
            }
            expect(now.cancelled.length).toBeGreaterThan(0)
            expect(yield* cancelledAt('5344')).toEqual(
              expect.arrayContaining(fændediget.filter((key) => now.cancelled.includes(key))),
            )
            expect((yield* cancelledAt('30090')).length).toBeGreaterThan(0)
          }
        }).pipe(Effect.provide(onListener(http)))
      }),
    // Each replays the recording's messages into a listener of its own, and can pass 5 s while
    // the whole suite runs.
    REPLAY_TIMEOUT,
  )
})
