import { describe, expect, it } from '@effect/vitest'
import { Effect, type Layer } from 'effect'
import { TestClock } from 'effect/testing'
import * as Http from './rejseplanen/http'
import { trackerLayer } from './runtime'
import { simulatedClient } from './simulation/layer'
import type { Snapshot } from './snapshot'
import { readSource } from './source'
import { fixtureTimetable } from './testing'
import type { Timetable } from './timetable'
import { Tracker, type PositionMode } from './tracker'

// 07:20 in Copenhagen on Tuesday 2026-06-16, when the fixture has trips underway and the RE
// stands Waiting at København H.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)

const timetable = await fixtureTimetable()
const simulated = readSource('simulated')

const tracker = (
  positionMode: PositionMode = 'CALC_REPORT',
  http?: Layer.Layer<Http.HttpClient.HttpClient>,
) => trackerLayer({ timetable, source: simulated, positionMode, ...(http ? { http } : {}) })

const snapshot = Effect.gen(function* () {
  return yield* (yield* Tracker).getSnapshot
})

/** The simulated Rejseplanen, with one more journey on a line the timetable doesn't have. */
const withStranger = Http.layer(
  Http.client((request) =>
    Effect.gen(function* () {
      const response = yield* simulatedClient({ timetable }).execute(request)
      const answer = (yield* response.json) as { Journey?: unknown[] }
      const stranger = {
        JourneyDetailRef: { ref: '2|#VN#1#ZI#99#DA#160626#FR#1#FT#720#TO#2#TT#800#ZE#XX#' },
        lat: 55.68,
        lon: 12.57,
      }
      return Http.json(request, 200, { ...answer, Journey: [...(answer.Journey ?? []), stranger] })
    }).pipe(Effect.orDie),
  ),
)

/** The simulated Rejseplanen for the first `good` calls, then 503 for every call after. */
const failingAfter = (good: number) => {
  let calls = 0
  const simulation = simulatedClient({ timetable })
  return Http.layer(
    Http.client((request) =>
      calls++ < good
        ? simulation.execute(request).pipe(Effect.orDie)
        : Effect.succeed(Http.json(request, 503, {})),
    ),
  )
}

/**
 * The fixture with a second platform beside each one, as a stop with platforms either side of
 * the road has, since no fixture trip starts at a stop with two.
 */
const twin = (id: string) => `99${id}`
const twinned: Timetable = {
  ...timetable,
  stops: {
    ...timetable.stops,
    platforms: [
      ...timetable.stops.platforms,
      ...timetable.stops.platforms.map((platform) => ({ ...platform, id: twin(platform.id) })),
    ],
    stopForPlatform: (id) =>
      timetable.stops.stopForPlatform(id.startsWith('99') ? id.slice(2) : id),
  },
}

/** The simulation, with each reference naming its first platform's twin. */
let moved = 0
const twinPlatforms = Http.layer(
  Http.client((request) =>
    Effect.gen(function* () {
      const response = yield* simulatedClient({ timetable }).execute(request)
      const text = yield* response.text
      const rewritten = text.replace(/#FR#(\d+)#/g, (_, id: string) => {
        moved++
        return `#FR#${twin(id)}#`
      })
      return Http.json(request, 200, JSON.parse(rewritten))
    }).pipe(Effect.orDie),
  ),
)

const calls = (s: Snapshot) => s.budget.calls

describe('the tracker', () => {
  it.effect('makes one call for two requests 10 s apart, and a second in the next minute', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const first = yield* snapshot
      expect(calls(first)).toBe(1)
      yield* TestClock.adjust('10 seconds')
      const second = yield* snapshot
      expect(second).toEqual(first)
      yield* TestClock.adjust('50 seconds')
      const third = yield* snapshot
      expect(calls(third)).toBe(2)
      expect(third.fetched).toBe(MOMENT + 60_000)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('names its source, position mode, timetable and when the next one is due', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      expect(s).toMatchObject({
        fetched: MOMENT,
        nextDue: MOMENT + 60_000,
        pollInterval: 60,
        serviceDay: '2026-06-16',
        timetableVersion: timetable.manifest.version,
        positionMode: 'CALC_REPORT',
        api: { status: 'ok', since: MOMENT },
        store: 'ok',
        source: { kind: 'simulated', name: 'weekday' },
      })
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('draws every trip the timetable puts on the map, each with its fields', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const { trips } = yield* snapshot
      expect(trips.length).toBeGreaterThanOrEqual(17)
      for (const trip of trips) {
        expect(trip.key).toMatch(/\.20260616\./)
        expect(trip.line).not.toBe('')
        expect(trip.position).toHaveLength(2)
        expect(trip.progress).toBeGreaterThanOrEqual(0)
        expect(trip.progress).toBeLessThanOrEqual(timetable.pathOf(trip.pattern).length + 1)
        expect(trip.next.length).toBeLessThanOrEqual(3)
        for (const call of trip.next) expect(call.time).toBeGreaterThan(MOMENT)
      }
      // A computed position is Estimated, and a trip no answer carries is Timetable only.
      const computed = trips.filter((trip) => trip.source === 'computed')
      expect(computed.length).toBeGreaterThan(0)
      expect(computed.every((trip) => trip.state === 'estimated' && trip.journey)).toBe(true)
      expect(computed.some((trip) => trip.delay !== undefined)).toBe(true)
      const planned = trips.filter((trip) => trip.source === 'timetable')
      expect(planned.every((trip) => trip.state === 'timetable-only' && !trip.hadRealtime)).toBe(
        true,
      )
      // The Metro is in no answer, so it is Timetable only.
      const metro = trips.filter((trip) => trip.mode === 'metro')
      expect(metro.every((trip) => trip.state === 'timetable-only')).toBe(true)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('stands a trip Waiting at its first stop before it leaves', () =>
    Effect.gen(function* () {
      // The RE leaves København H at 07:17; at 07:14 it is Waiting there.
      yield* TestClock.setTime(MOMENT - 6.5 * 60_000)
      const { trips } = yield* snapshot
      const re = trips.find((trip) => trip.line === 'RE' && trip.waiting)
      expect(re).toBeDefined()
      expect(re?.progress).toBe(0)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('makes REPORT_ONLY positions Live', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const { trips } = yield* snapshot
      const reported = trips.filter((trip) => trip.source === 'reported')
      expect(reported.length).toBeGreaterThan(0)
      expect(reported.every((trip) => trip.state === 'live' && trip.reported === MOMENT)).toBe(true)
    }).pipe(Effect.provide(tracker('REPORT_ONLY'))),
  )

  it.effect('alternates the modes by minute and says which this answer used', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const first = yield* snapshot
      yield* TestClock.adjust('60 seconds')
      const second = yield* snapshot
      expect(first.positionMode).toBe('alternating')
      expect(new Set([first.answerMode, second.answerMode])).toEqual(
        new Set(['REPORT_ONLY', 'CALC_REPORT']),
      )
      const reporting = first.answerMode === 'REPORT_ONLY' ? first : second
      expect(reporting.trips.some((trip) => trip.state === 'live')).toBe(true)
    }).pipe(Effect.provide(tracker('alternating'))),
  )

  it.effect('counts a journey no trip fits, and doesn’t draw it', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      expect(s.status.unmatched).toBe(1)
      expect(s.trips.some((trip) => trip.line === 'XX')).toBe(false)
    }).pipe(Effect.provide(tracker('CALC_REPORT', withStranger))),
  )

  it.effect('keeps the previous trips when a call fails, with an error health', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const good = yield* snapshot
      yield* TestClock.adjust('60 seconds')
      const failed = yield* snapshot
      expect(failed.api).toEqual({ status: 'error', since: MOMENT + 60_000, kind: 'status' })
      expect(failed.trips).toEqual(good.trips)
      expect(failed.fetched).toBe(good.fetched)
      expect(failed.nextDue).toBe(MOMENT + 120_000)
      expect(failed.status.calls).toEqual([
        { service: 'journeyPos', outcome: 'status', attempts: 2, ms: 0 },
      ])
      // Every attempt is counted: one good call, then a 503 tried twice.
      expect(calls(failed)).toBe(3)
      yield* TestClock.adjust('60 seconds')
      const again = yield* snapshot
      expect(again.api.since).toBe(MOMENT + 60_000)
    }).pipe(Effect.provide(tracker('CALC_REPORT', failingAfter(1)))),
  )

  it.effect('joins a journey whose reference names another platform of its first stop', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      expect(moved).toBeGreaterThan(0)
      expect(s.status.unmatched).toBe(0)
      expect(s.trips.some((trip) => trip.source === 'computed')).toBe(true)
    }).pipe(
      Effect.provide(
        trackerLayer({
          timetable: twinned,
          source: simulated,
          positionMode: 'CALC_REPORT',
          http: twinPlatforms,
        }),
      ),
    ),
  )

  it.effect('answers a stop’s departures and a trip’s calls from the timetable and its delay', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const t = yield* Tracker
      const { trips } = yield* t.getSnapshot
      const late = trips.find((trip) => trip.delay !== undefined && trip.delay > 0)!
      const detail = yield* t.getTripDetail(late.key)
      expect(detail).toMatchObject({ key: late.key, line: late.line, delay: late.delay })
      const next = detail!.calls[late.next[0].index]
      expect(next.expectedDeparture! - next.departure).toBe(late.delay! * 1000)

      const stop = timetable.stops.stopForPlatform(late.next[0].stop)!
      const board = yield* t.getStopDepartures(stop.id)
      expect(board?.stop).toEqual({ id: stop.id, name: stop.name })
      // A platform's id finds its stop too.
      expect((yield* t.getStopDepartures(late.next[0].stop))?.stop.id).toBe(stop.id)
      const row = board?.departures.find((each) => each.trip === late.key)
      expect(row).toMatchObject({ expected: next.expectedDeparture, state: late.state })
      const times = board!.departures.map((each) => each.expected ?? each.scheduled)
      expect(times).toEqual([...times].sort((a, b) => a - b))

      expect(yield* t.getStopDepartures('no such stop')).toBeUndefined()
      expect(yield* t.getTripDetail('bus.5C.nothing.20260616.0700')).toBeUndefined()
    }).pipe(Effect.provide(tracker())),
  )
})
