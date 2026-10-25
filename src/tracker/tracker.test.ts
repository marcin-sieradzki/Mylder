import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Logger } from 'effect'
import { TestClock } from 'effect/testing'
import { expectedUnderway } from './build'
import { EMPTY_ANSWER_MIN_UNDERWAY } from './health'
import { readRef } from './join'
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

/** The planned arrival at a trip's last stop. */
const arrives = (key: string) =>
  timetable
    .tripsOn('2026-06-16')
    .find((trip) => trip.key === key)!
    .calls.at(-1)!.arrival

/** The simulation, leaving out the journeys (`ZI@DA`) in `dropped`. */
const dropping = (dropped: ReadonlySet<string>) =>
  Http.layer(
    Http.client((request) =>
      Effect.gen(function* () {
        const response = yield* simulatedClient({ timetable }).execute(request)
        const answer = (yield* response.json) as {
          Journey?: { JourneyDetailRef: { ref: string } }[]
        }
        const kept = (answer.Journey ?? []).filter(
          (journey) => !dropped.has(readRef(journey.JourneyDetailRef.ref)?.journey ?? ''),
        )
        return Http.json(request, 200, { ...answer, Journey: kept })
      }).pipe(Effect.orDie),
    ),
  )

/** The tracker on the patchy scenario, whose hourly outage runs from minute 20 to 27. */
const patchy = (positionMode: PositionMode) =>
  trackerLayer({ timetable, source: readSource('simulated:patchy'), positionMode })

/** An answer with no trips in it. */
const empty = Http.layer(Http.client((request) => Effect.succeed(Http.json(request, 200, {}))))

/** The fixture with each trip running ten times over, so the morning expects plenty underway. */
const busy: Timetable = {
  ...timetable,
  tripsOn: (day) =>
    timetable
      .tripsOn(day)
      .flatMap((trip) =>
        Array.from({ length: 10 }, (_, copy) => ({ ...trip, key: `${trip.key}.${copy}` })),
      ),
}

/** A key no answer or log line may carry. */
const KEY = 'test-key-1234'

/** An answer the schema rejects, echoing the request's query the way a broken gateway might. */
const rejected = Http.layer(
  Http.client((request) => Effect.succeed(Http.json(request, 200, { Journey: `accessId=${KEY}` }))),
)

const calls = (s: Snapshot) => s.budget.calls

/** The snapshot `count` minutes on, asking for one every minute as a watching browser does. */
const minutesLater = (count: number) =>
  Effect.gen(function* () {
    let latest: Snapshot | undefined
    for (let i = 0; i < count; i++) {
      yield* TestClock.adjust('60 seconds')
      latest = yield* snapshot
    }
    return latest!
  })

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

  it.effect('keeps a reporting trip Live on its report through the computed minute between', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      let previous = yield* snapshot
      if (previous.answerMode !== 'REPORT_ONLY') previous = yield* minutesLater(1)
      const reporting = previous.trips.filter((trip) => trip.state === 'live')
      const computed = yield* minutesLater(1)
      expect(computed.answerMode).toBe('CALC_REPORT')
      const keys = new Set(reporting.map((trip) => trip.key))
      const live = computed.trips.filter((trip) => keys.has(trip.key))
      expect(live.length).toBeGreaterThan(0)
      // Live, labelled from its report, and drawn from it, never from the computed position.
      for (const trip of live) {
        expect(trip).toMatchObject({
          state: 'live',
          source: 'reported',
          reported: previous.fetched,
        })
      }
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

  it.effect('ages a trip that drops out of the answers, moving on all the while', () => {
    const dropped = new Set<string>()
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const first = yield* snapshot
      const trip = first.trips.find(
        (each) => each.state === 'live' && arrives(each.key) > MOMENT + 8 * 60_000,
      )!
      expect(trip).toBeDefined()
      dropped.add(trip.journey!)
      const at = (s: Snapshot) => s.trips.find((each) => each.key === trip.key)!
      const states: string[] = []
      const sources: string[] = []
      const progress: number[] = []
      for (let minute = 1; minute <= 6; minute++) {
        yield* TestClock.adjust('60 seconds')
        const later = at(yield* snapshot)
        states.push(later.state)
        sources.push(later.source)
        progress.push(later.progress)
        expect(later.reported).toBe(MOMENT)
        expect(later.hadRealtime).toBe(true)
      }
      // One missed answer ends nothing and two (at 60 s polls, 150 s) do: Live, then Ageing
      // from 3 min, then No signal from 5 min, five minutes after the last answer to carry it.
      expect(states).toEqual(['live', 'live', 'ageing', 'ageing', 'no-signal', 'no-signal'])
      // Its last report carried on while Live and Ageing, then the timetable plus its delay.
      expect(sources).toEqual([
        'reported',
        'reported',
        'reported',
        'reported',
        'timetable',
        'timetable',
      ])
      expect(progress[0]).toBeGreaterThan(trip.progress)
      expect(progress).toEqual([...progress].sort((a, b) => a - b))
      expect(progress[5]).toBeGreaterThan(progress[2])
    }).pipe(Effect.provide(tracker('REPORT_ONLY', dropping(dropped))))
  })

  it.effect('lets one failed answer change no trip’s state, and two end Live', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const good = yield* snapshot
      const live = good.trips.filter((trip) => trip.state === 'live')
      expect(live.length).toBeGreaterThan(0)
      const failed = yield* minutesLater(1)
      expect(failed.api).toEqual({ status: 'error', since: MOMENT + 60_000, kind: 'status' })
      expect(failed.status.calls).toEqual([
        { service: 'journeyPos', outcome: 'status', attempts: 2, ms: 0 },
      ])
      // Every attempt is counted: one good call, then a 503 tried twice.
      expect(calls(failed)).toBe(3)
      const before = new Map(good.trips.map((trip) => [trip.key, trip]))
      const kept = failed.trips.filter((trip) => before.has(trip.key))
      expect(kept.length).toBeGreaterThan(0)
      for (const trip of kept) {
        expect(trip.state).toBe(before.get(trip.key)!.state)
        expect(trip.progress).toBeGreaterThanOrEqual(before.get(trip.key)!.progress)
      }
      // Past the Live limit, 150 s at 60 s polls, the reports are Ageing.
      const later = yield* minutesLater(2)
      expect(later.api.since).toBe(MOMENT + 60_000)
      const states = new Map(later.trips.map((trip) => [trip.key, trip.state]))
      const still = live.filter((trip) => states.has(trip.key))
      expect(still.length).toBeGreaterThan(0)
      expect(still.every((trip) => states.get(trip.key) === 'ageing')).toBe(true)
    }).pipe(Effect.provide(tracker('REPORT_ONLY', failingAfter(1)))),
  )

  for (const [mode, restored] of [
    ['CALC_REPORT', 'estimated'],
    ['REPORT_ONLY', 'live'],
  ] as const) {
    it.effect(
      `rides out an outage in ${mode}: error health, trips moving, No signal, then ${restored}`,
      () =>
        Effect.gen(function* () {
          // The patchy scenario answers 503 from minute 20 to 27 of every hour.
          yield* TestClock.setTime(MOMENT - 60_000)
          const good = yield* snapshot
          expect(good.api.status).toBe('ok')
          const seen = good.trips.filter((trip) => trip.hadRealtime)
          expect(seen.length).toBeGreaterThan(0)

          // Three 503s in a row: error health, and the trips still there, still moving.
          const third = yield* minutesLater(3)
          expect(third.api).toEqual({ status: 'error', since: MOMENT, kind: 'status' })
          const now = new Map(third.trips.map((trip) => [trip.key, trip]))
          const underway = seen.filter((trip) => !trip.waiting && now.has(trip.key))
          expect(underway.length).toBeGreaterThan(0)
          expect(underway.some((trip) => now.get(trip.key)!.progress > trip.progress)).toBe(true)
          expect(underway.every((trip) => now.get(trip.key)!.hadRealtime)).toBe(true)

          // Six minutes after the last answer, every trip with realtime is No signal.
          const out = yield* minutesLater(3)
          const withRealtime = out.trips.filter((trip) => trip.hadRealtime)
          expect(withRealtime.length).toBeGreaterThan(0)
          expect(withRealtime.every((trip) => trip.state === 'no-signal')).toBe(true)

          // The first good answer, at minute 27, restores every trip it carries; one it leaves
          // out stays No signal.
          const back = yield* minutesLater(2)
          expect(back.api).toEqual({ status: 'ok', since: back.fetched })
          const carried = back.trips.filter((trip) => trip.seen === back.fetched)
          expect(carried.length).toBeGreaterThan(0)
          expect(carried.every((trip) => trip.state === restored)).toBe(true)
          const left = back.trips.filter((trip) => trip.hadRealtime && trip.seen !== back.fetched)
          expect(left.every((trip) => trip.state === 'no-signal')).toBe(true)
        }).pipe(Effect.provide(patchy(mode))),
    )
  }

  it.effect('counts an answer with no trips as empty when the timetable expects plenty', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const t = yield* Tracker
      const s = yield* t.getSnapshot
      expect(s.api).toEqual({ status: 'empty', since: MOMENT })
      expect(s.status.calls[0].outcome).toBe('empty')
    }).pipe(Effect.provide(trackerLayer({ timetable: busy, source: simulated, http: empty }))),
  )

  it.effect(
    'counts an answer with no trips as ok when the timetable expects few, as at night',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        expect(expectedUnderway(timetable, MOMENT)).toBeLessThan(EMPTY_ANSWER_MIN_UNDERWAY)
        expect((yield* snapshot).api).toEqual({ status: 'ok', since: MOMENT })
      }).pipe(Effect.provide(tracker('CALC_REPORT', empty))),
  )

  it.effect('counts an answer the schema rejects as an error, and logs it without the key', () => {
    const logged: string[] = []
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      expect(s.api).toEqual({ status: 'error', since: MOMENT, kind: 'body' })
      expect(logged.length).toBeGreaterThan(0)
      expect(logged.join('\n')).not.toContain(KEY)
    }).pipe(
      Effect.provide(
        Layer.merge(
          trackerLayer({
            timetable,
            source: simulated,
            positionMode: 'CALC_REPORT',
            key: KEY,
            http: rejected,
          }),
          Logger.layer([Logger.make(({ message }) => void logged.push(String(message)))]),
        ),
      ),
    )
  })

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
