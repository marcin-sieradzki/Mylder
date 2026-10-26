import { describe, expect, it } from '@effect/vitest'
import { Effect, Fiber, type Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { pacing } from './budget'
import { callsKey } from './rejseplanen/client'
import * as Http from './rejseplanen/http'
import { keyPrefixOf, trackerLayer } from './runtime'
import { readSource } from './source'
import { simulatedClient } from './simulation/layer'
import { WEEKDAY } from './simulation/scenarios'
import { Store } from './store'
import { fixtureTimetable } from './testing'
import { Tracker } from './tracker'

// A stop's on-demand departures (docs/live-data.md, "The budget"): one `multiDepartureBoard`
// call for the stop's platforms when the budget allows it, cached a minute, at most ten a minute
// across all viewers, else the timetable plus the snapshot's delay. 07:20 in Copenhagen on
// Tuesday 2026-06-16, on the simulated Rejseplanen.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)
const ZONE = 'Europe/Copenhagen'

const timetable = await fixtureTimetable()
const weekday = readSource('simulated')
const prefix = keyPrefixOf(weekday)

const tracker = (http?: Layer.Layer<Http.HttpClient.HttpClient>) =>
  trackerLayer({
    timetable,
    source: weekday,
    positionMode: 'CALC_REPORT',
    ...(http ? { http } : {}),
  })

/** The month's board calls so far, from the store's counter. */
const boardCalls = Effect.gen(function* () {
  const calls = yield* (yield* Store).get(callsKey(prefix, '2026-06', 'multiDepartureBoard'))
  return typeof calls === 'number' ? calls : 0
})

const departures = (stopId: string) =>
  Effect.gen(function* () {
    return yield* (yield* Tracker).getStopDepartures(stopId)
  })

/** Nørreport, where buses and S-tog leave in the next half hour. */
const NORREPORT = '27532'

/** København H, where only S-tog call in the fixture. */
const KOBENHAVN_H = '8600626'

/** The simulated Rejseplanen on a weekday where a third of trips are called off. */
const cancelling = Http.layer(
  simulatedClient({ timetable, scenario: { ...WEEKDAY, name: 'cancelling', cancelled: 0.3 } }),
)

/** Orientkaj, where a bus starts its trip in the next half hour: not yet on the map. */
const ORIENTKAJ = '54307'

/** The simulated Rejseplanen, with one service answering 503 to every call. */
const failing = (service: string) => {
  const simulation = simulatedClient({ timetable })
  return Http.layer(
    Http.client((request, url) =>
      url.pathname.endsWith(service)
        ? Effect.succeed(Http.json(request, 503, {}))
        : simulation.execute(request).pipe(Effect.orDie),
    ),
  )
}

/** The simulated Rejseplanen, its departure boards taking a second to answer. */
const slow = (() => {
  const simulation = simulatedClient({ timetable })
  return Http.layer(
    Http.client((request, url) =>
      (url.pathname.endsWith('multiDepartureBoard') ? Effect.sleep('1 second') : Effect.void).pipe(
        Effect.andThen(simulation.execute(request)),
        Effect.orDie,
      ),
    ),
  )
})()

/** Eleven stops with buses or S-tog leaving in the next half hour. */
const BUSY_STOPS = [
  '718',
  '1957',
  '1958',
  '1959',
  '1969',
  '2151',
  '8600626',
  '8600634',
  '8600645',
  '8600650',
  '8600760',
]

describe('a stop’s on-demand departures', () => {
  it.effect('makes one board call for a stop opened twice in a minute', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const first = yield* departures(NORREPORT)
      expect(first?.source).toEqual({ kind: 'rejseplanen', at: MOMENT })
      yield* TestClock.adjust('30 seconds')
      const second = yield* departures(NORREPORT)
      expect(second?.source).toEqual({ kind: 'rejseplanen', at: MOMENT })
      expect(yield* boardCalls).toBe(1)
      // A minute after the call, the next viewer gets a fresh one.
      yield* TestClock.adjust('30 seconds')
      expect((yield* departures(NORREPORT))?.source).toEqual({
        kind: 'rejseplanen',
        at: MOMENT + 60_000,
      })
      expect(yield* boardCalls).toBe(2)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('makes one board call for a stop two viewers open at once', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      // The map's snapshot first, so both viewers ask for the board alone.
      yield* (yield* Tracker).getSnapshot
      const both = yield* Effect.forkChild(
        Effect.all([departures(NORREPORT), departures(NORREPORT)], { concurrency: 'unbounded' }),
      )
      yield* TestClock.adjust('1 second')
      const [first, second] = yield* Fiber.join(both)
      expect(yield* boardCalls).toBe(1)
      // The one that found the call under way answers from the timetable meanwhile.
      expect([first?.source.kind, second?.source.kind].sort()).toEqual(['rejseplanen', 'timetable'])
    }).pipe(Effect.provide(tracker(slow))),
  )

  it.effect('answers the 11th stop opened in a minute from the timetable', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const sources = []
      for (const stop of BUSY_STOPS) sources.push((yield* departures(stop))?.source.kind)
      expect(sources).toEqual([...Array(10).fill('rejseplanen'), 'timetable'])
      expect(yield* boardCalls).toBe(10)
      // The next minute has room again.
      yield* TestClock.adjust('60 seconds')
      expect((yield* departures(BUSY_STOPS[10]))?.source.kind).toBe('rejseplanen')
    }).pipe(Effect.provide(tracker())),
  )

  it.effect(
    'makes no call at a normal level without a cushion, and keeps the snapshot’s delay',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        // 50 calls under the line: normal, but inside the cushion of 100.
        const { line } = pacing({ calls: 0, now: MOMENT, timezone: ZONE })
        yield* (yield* Store).set(callsKey(prefix, '2026-06'), Math.ceil(line) - 50)
        const { trips } = yield* (yield* Tracker).getSnapshot
        const late = trips.find(
          (trip) => trip.delay !== undefined && trip.delay > 0 && trip.mode !== 'metro',
        )!
        const stop = timetable.stops.stopForPlatform(late.next[0].stop)!
        const answer = (yield* departures(stop.id))!
        expect(answer.source).toEqual({ kind: 'timetable' })
        const row = answer.departures.find((each) => each.trip === late.key)!
        expect(row.expected! - row.scheduled).toBe(late.delay! * 1000)
        expect(row.state).toBe(late.state)
        expect(yield* boardCalls).toBe(0)
      }).pipe(Effect.provide(tracker())),
  )

  it.effect('has no answer for an unknown stop, and makes no call for one', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      expect(yield* departures('no such stop')).toBeUndefined()
      expect(yield* boardCalls).toBe(0)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('gives each row the board’s track and keeps cancelled departures, marked', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const answer = (yield* departures(KOBENHAVN_H))!
      expect(answer.source.kind).toBe('rejseplanen')
      const running = answer.departures.filter((row) => !row.cancelled)
      const cancelled = answer.departures.filter((row) => row.cancelled)
      expect(running.length).toBeGreaterThan(0)
      expect(cancelled.length).toBeGreaterThan(0)
      // The simulation gives S-tog a track wherever they run, and a cancelled one no realtime.
      expect(running.every((row) => row.track !== undefined && row.expected !== undefined)).toBe(
        true,
      )
      expect(cancelled.every((row) => row.cancelled === true && row.expected === undefined)).toBe(
        true,
      )
    }).pipe(Effect.provide(tracker(cancelling))),
  )

  it.effect(
    'agrees with the snapshot’s delays on the simulation, and calls a row off the map Estimated',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        const { trips } = yield* (yield* Tracker).getSnapshot
        const onMap = new Map(trips.map((trip) => [trip.key, trip]))
        let compared = 0
        let offMap = 0
        for (const stop of [...BUSY_STOPS.slice(0, 9), ORIENTKAJ]) {
          const answer = (yield* departures(stop))!
          expect(answer.source.kind).toBe('rejseplanen')
          for (const row of answer.departures) {
            const trip = onMap.get(row.trip)
            if (row.expected === undefined) continue
            if (trip?.delay !== undefined) {
              expect(row.expected - row.scheduled).toBe(trip.delay * 1000)
              expect(row.state).toBe(trip.state)
              compared++
            } else if (!trip) {
              expect(row.state).toBe('estimated')
              offMap++
            }
          }
        }
        expect(compared).toBeGreaterThan(10)
        expect(offMap).toBeGreaterThan(0)
      }).pipe(Effect.provide(tracker())),
  )

  it.effect('shows the messages on a stop’s board', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const answer = (yield* departures(KOBENHAVN_H))!
      expect(answer.source.kind).toBe('rejseplanen')
      // The S-tog signal fault names København H; no disruption list was fetched.
      expect(answer.messages.map(({ message }) => message.id)).toEqual(['simulated-2'])
      expect(answer.messages[0]).toMatchObject({
        fieldsKind: 'service-notice',
        message: { head: 'Færre S-tog mellem København H og Hellerup' },
      })
    }).pipe(Effect.provide(tracker(failing('himsearch')))),
  )

  it.effect('answers from the timetable when the board call fails, with the list’s messages', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const answer = (yield* departures(KOBENHAVN_H))!
      expect(answer.source).toEqual({ kind: 'timetable' })
      expect(answer.departures.length).toBeGreaterThan(0)
      expect(answer.messages.map(({ message }) => message.id)).toEqual(['simulated-2'])
      // A 503 is tried once more, and both count.
      expect(yield* boardCalls).toBe(2)
    }).pipe(Effect.provide(tracker(failing('multiDepartureBoard')))),
  )

  it.effect('reads the Metro on a board as intervals, beside the buses’ and S-tog’s times', () =>
    Effect.gen(function* () {
      // 07:05, when M1 leaves Nørreport both ways in the next half hour.
      yield* TestClock.setTime(Date.UTC(2026, 5, 16, 5, 5))
      const answer = (yield* departures(NORREPORT))!
      expect(answer.source.kind).toBe('rejseplanen')
      expect(answer.departures.length).toBeGreaterThan(0)
      expect(answer.departures.some((row) => row.mode === 'metro')).toBe(false)
      expect(answer.intervals.map(({ line, every }) => [line, every])).toEqual([
        ['M1', { from: 4, to: 4 }],
        ['M1', { from: 4, to: 4 }],
      ])
    }).pipe(Effect.provide(tracker())),
  )
})
