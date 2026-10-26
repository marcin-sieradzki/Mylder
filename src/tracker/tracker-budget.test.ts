import { describe, expect, it } from '@effect/vitest'
import { Effect, Fiber, type Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { pacing, SPENT_AT } from './budget'
import { callsKey } from './rejseplanen/client'
import * as Http from './rejseplanen/http'
import { keyPrefixOf, trackerLayer } from './runtime'
import type { Snapshot } from './snapshot'
import { readSource } from './source'
import { Store, type StoreShape } from './store'
import { fixtureTimetable } from './testing'
import { Tracker } from './tracker'
import { simulatedClient } from './simulation/layer'

// The tracker at the budget's levels (docs/live-data.md, "The pacing rule"), with the month's
// counter seeded in the store. 07:20 in Copenhagen on Tuesday 2026-06-16.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)
const ZONE = 'Europe/Copenhagen'

const timetable = await fixtureTimetable()
const weekday = readSource('simulated')
const counter = callsKey(keyPrefixOf(weekday), '2026-06')

const tracker = (http?: Layer.Layer<Http.HttpClient.HttpClient>) =>
  trackerLayer({
    timetable,
    source: weekday,
    positionMode: 'CALC_REPORT',
    ...(http ? { http } : {}),
  })

const snapshot = Effect.gen(function* () {
  return yield* (yield* Tracker).getSnapshot
})

/** Sets the month's counter to the line at the moment plus `ahead`. */
const seed = (ahead: number) =>
  Effect.gen(function* () {
    const { line } = pacing({ calls: 0, now: MOMENT, timezone: ZONE })
    yield* (yield* Store).set(counter, Math.ceil(line) + ahead)
  })

/** The snapshot a minute on. */
const minuteLater = Effect.gen(function* () {
  yield* TestClock.adjust('60 seconds')
  return yield* snapshot
})

describe('the tracker’s budget', () => {
  it.effect('polls every 60 s while the month spends under its line', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* seed(-500)
      expect(yield* snapshot).toMatchObject({
        pollInterval: 60,
        nextDue: MOMENT + 60_000,
        budget: { level: 'normal' },
      })
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('stretches the next run to 90 s when the month runs ahead', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* seed(10)
      const s = yield* snapshot
      expect(s).toMatchObject({
        pollInterval: 90,
        nextDue: MOMENT + 90_000,
        budget: { level: 'stretched' },
      })
      // No run until it is due.
      yield* TestClock.adjust('60 seconds')
      expect(yield* snapshot).toEqual(s)
      yield* TestClock.adjust('30 seconds')
      expect((yield* snapshot).fetched).toBe(MOMENT + 90_000)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('tightens the next run to 120 s over 1,500 ahead', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* seed(1_600)
      expect(yield* snapshot).toMatchObject({
        pollInterval: 120,
        nextDue: MOMENT + 120_000,
        budget: { level: 'tight' },
      })
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('is spent at 49,500 calls: no call, trips moving and ageing, back on the 1st', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const good = yield* snapshot
      yield* (yield* Store).set(counter, SPENT_AT)
      const spent = yield* minuteLater
      expect(spent.budget).toEqual({ level: 'spent', calls: SPENT_AT, resumes: '2026-07-01' })
      expect(spent.api).toEqual({ status: 'spent', since: MOMENT + 60_000 })
      expect(spent.status.calls).toEqual([])
      const before = new Map(good.trips.map((trip) => [trip.key, trip]))
      const underway = spent.trips.filter((trip) => before.has(trip.key) && !trip.waiting)
      expect(underway.some((trip) => trip.progress > before.get(trip.key)!.progress)).toBe(true)

      let later: Snapshot = spent
      for (let i = 0; i < 5; i++) later = yield* minuteLater
      expect(later.budget.calls).toBe(SPENT_AT)
      const withRealtime = later.trips.filter((trip) => trip.hadRealtime)
      expect(withRealtime.length).toBeGreaterThan(0)
      expect(withRealtime.every((trip) => trip.state === 'no-signal')).toBe(true)

      // Midnight on 1 July in Copenhagen: a new month's counter, and calls again.
      yield* TestClock.setTime(Date.UTC(2026, 5, 30, 22, 0, 30))
      const first = yield* snapshot
      // Its positions and disruptions.
      expect(first.budget).toEqual({ level: 'normal', calls: 2 })
      expect(first.api.status).toBe('ok')
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('is spent after a quota error, and makes no call after it this month', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const refused = yield* snapshot
      expect(refused.api).toEqual({ status: 'spent', since: MOMENT, kind: 'quota' })
      // A 4xx is not tried again, and the disruption call isn't made, so the month has one call.
      expect(refused.budget).toEqual({ level: 'spent', calls: 1, resumes: '2026-07-01' })
      const after = yield* minuteLater
      expect(after.budget.calls).toBe(1)
      expect(after.status.calls).toEqual([])
      expect(after.api.since).toBe(MOMENT)
      // On 1 July it asks again, and the simulation's quota error spends July too.
      yield* TestClock.setTime(Date.UTC(2026, 5, 30, 22, 0, 30))
      const july = yield* snapshot
      expect(july.status.calls).toHaveLength(1)
      expect(july.budget).toEqual({ level: 'spent', calls: 1, resumes: '2026-08-01' })
    }).pipe(
      Effect.provide(
        trackerLayer({
          timetable,
          source: readSource('simulated:spent'),
          positionMode: 'CALC_REPORT',
        }),
      ),
    ),
  )

  it.effect('counts a call before it is sent, so one that times out still counts', () => {
    let store: StoreShape | undefined
    let countWhenSent: unknown
    const hanging = Http.layer(
      Http.client(() =>
        Effect.gen(function* () {
          countWhenSent ??= yield* store!.get(counter)
          return yield* Effect.never
        }),
      ),
    )
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      store = yield* Store
      const fiber = yield* Effect.forkChild(snapshot)
      // The positions call and the disruptions call each time out at 8 s.
      yield* TestClock.adjust('16 seconds')
      const s = yield* Fiber.join(fiber)
      expect(countWhenSent).toBe(1)
      expect(s.api).toEqual({ status: 'error', since: MOMENT, kind: 'timeout' })
      expect(s.budget.calls).toBe(2)
    }).pipe(Effect.provide(tracker(hanging)))
  })

  it.effect('takes the modes in turns by run at 90 s, through a failed run', () => {
    let sent = 0
    const simulation = simulatedClient({ timetable })
    const secondFails = Http.layer(
      Http.client((request, url) =>
        // The second run's positions call and its retry.
        url.pathname.endsWith('journeyPos') && [1, 2].includes(sent++)
          ? Effect.succeed(Http.json(request, 503, {}))
          : simulation.execute(request).pipe(Effect.orDie),
      ),
    )
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* seed(10)
      const modes: (string | undefined)[] = []
      for (let i = 0; i < 3; i++) {
        const s = yield* snapshot
        expect(s.pollInterval).toBe(90)
        modes.push(s.answerMode)
        if (i === 1) expect(s.api.status).toBe('error')
        yield* TestClock.adjust('90 seconds')
      }
      // 07:20:30, 07:22:00 and 07:23:30: by the minute the first two would both be computed.
      expect(modes).toEqual(['CALC_REPORT', 'REPORT_ONLY', 'CALC_REPORT'])
    }).pipe(
      Effect.provide(
        trackerLayer({
          timetable,
          source: weekday,
          positionMode: 'alternating',
          http: secondFails,
        }),
      ),
    )
  })
})
