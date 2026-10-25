import { describe, expect, it } from '@effect/vitest'
import { Effect, Fiber, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { DepartureBoardAnswer, JourneyDetailAnswer, JourneyPosAnswer } from '../rejseplanen/answers'
import { apiLayer, readSource } from '../source'
import { fixtureTimetable } from '../testing'
import { loadTimetable } from '../timetable'
import { journeyRef } from './journeys'
import * as SimulatedRejseplanen from './layer'
import { SCENARIOS, WEEKDAY, type Scenario } from './scenarios'
import { call, CITY, MOMENT, request } from './testing'
import {
  simulatedDay,
  simulateTrip,
  worldAt,
  type SimulatedTrip,
  type SimulationSettings,
} from './world'

const MINUTE = 60_000
const timetable = await fixtureTimetable()

const simulation = (scenario: Scenario, seed = 1) =>
  SimulatedRejseplanen.layer({ timetable, scenario, seed })

const journeyRefs = (query: Record<string, string | number> = {}, moment = MOMENT) =>
  call('journeyPos', { ...CITY, ...query }, moment).pipe(
    Effect.map(({ body }) => Schema.decodeUnknownSync(JourneyPosAnswer)(JSON.parse(body))),
    Effect.map((answer) => (answer.Journey ?? []).map((j) => j.JourneyDetailRef.ref)),
  )

const refOf = ({ trip, journeyNumber }: SimulatedTrip) => journeyRef(timetable, trip, journeyNumber)

describe('silences', () => {
  const patchy: SimulationSettings = { timetable, scenario: SCENARIOS.patchy, seed: 1 }
  const quietOften: Scenario = {
    ...WEEKDAY,
    name: 'quiet-often',
    silence: { share: 1, minutes: { from: 3, to: 5 }, forGood: 0 },
  }
  const often: SimulationSettings = { timetable, scenario: quietOften, seed: 1 }
  const moments = Array.from({ length: 90 }, (_, i) => Date.UTC(2026, 5, 16, 5, 0) + i * MINUTE)

  it.effect('leave a quiet trip out of the answers for its silence and bring it back after', () =>
    Effect.gen(function* () {
      // A trip carried and underway before, during and after a silence.
      const worlds = moments.map((moment) => worldAt(often, moment))
      const states = (key: string) => worlds.map((w) => w.trips.find((t) => t.trip.key === key))
      const keys = new Set(worlds.flatMap((w) => w.trips.map((t) => t.trip.key)))
      const found = [...keys].flatMap((key) => {
        const each = states(key)
        const visible = (i: number) => each[i]?.vehicle?.phase === 'underway' && each[i]!.carried
        const quiet = each.findIndex((t, i) => t?.quiet && visible(i))
        if (quiet === -1) return []
        const before = each.findLastIndex((t, i) => i < quiet && visible(i) && !t!.quiet)
        const after = each.findIndex((t, i) => i > quiet && visible(i) && !t!.quiet)
        return before !== -1 && after !== -1
          ? [{ simulated: each[quiet]!, before, quiet, after }]
          : []
      })
      expect(found.length).toBeGreaterThan(0)
      const [{ simulated, before, quiet, after }] = found
      const ref = refOf(simulated)
      expect(yield* journeyRefs({}, moments[before])).toContain(ref)
      expect(yield* journeyRefs({}, moments[quiet])).not.toContain(ref)
      expect(yield* journeyRefs({}, moments[after])).toContain(ref)
    }).pipe(Effect.provide(simulation(quietOften))),
  )

  it('are the same for a seed and differ between seeds', () => {
    const quiet = (seed: number) =>
      moments.flatMap((m) =>
        worldAt({ ...patchy, seed }, m)
          .trips.filter((t) => t.quiet)
          .map((t) => `${m} ${t.trip.key}`),
      )
    expect(quiet(1).length).toBeGreaterThan(0)
    expect(quiet(1)).toEqual(quiet(1))
    expect(quiet(2)).not.toEqual(quiet(1))
  })
})

describe('cancellations', () => {
  const often: Scenario = {
    ...WEEKDAY,
    name: 'often-cancelled',
    cancelled: 0.4,
    cancelledCall: 0.6,
  }
  const settings: SimulationSettings = { timetable, scenario: often, seed: 1 }
  const every: Scenario = { ...WEEKDAY, name: 'all-cancelled', cancelled: 1 }
  const allCancelled: SimulationSettings = { timetable, scenario: every, seed: 1 }

  it.effect('leave a cancelled trip out of positions and tell departures and its detail', () =>
    Effect.gen(function* () {
      const cancelled = simulatedDay(allCancelled, '2026-06-16')
        .trips.filter((trip) => {
          const first = trip.calls[0].departure
          return first > MOMENT && first < MOMENT + 60 * MINUTE
        })
        .map((trip) => simulateTrip(allCancelled, trip, MOMENT))
        .find((t) => t.cancelled)!
      expect(cancelled).toBeDefined()
      const ref = refOf(cancelled)
      expect(yield* journeyRefs()).not.toContain(ref)

      const first = timetable.stops.platforms[cancelled.trip.calls[0].platform]
      const { body } = yield* call('multiDepartureBoard', { idList: first.id, duration: 90 })
      const departures = Schema.decodeUnknownSync(DepartureBoardAnswer)(JSON.parse(body)).Departure
      const row = departures?.find((d) => d.JourneyDetailRef.ref === ref)
      expect(row).toMatchObject({ cancelled: true, reachable: false })
      expect(row?.prognosisType).toBeUndefined()

      const detail = yield* call('journeyDetail', { id: ref })
      expect(Schema.decodeUnknownSync(JourneyDetailAnswer)(JSON.parse(detail.body))).toMatchObject({
        cancelled: true,
        reachable: false,
      })
    }).pipe(Effect.provide(simulation(every))),
  )

  it.effect('mark a single cancelled call while the trip runs', () =>
    Effect.gen(function* () {
      const running = worldAt(settings, MOMENT).trips.find(
        (t) => !t.cancelled && t.cancelledCalls.length > 0 && t.vehicle,
      )!
      expect(running).toBeDefined()
      const ref = refOf(running)
      const { body } = yield* call('journeyDetail', { id: ref })
      const stops = Schema.decodeUnknownSync(JourneyDetailAnswer)(JSON.parse(body)).Stops.Stop
      const [skipped] = running.cancelledCalls
      expect(stops[skipped]).toMatchObject({ cancelledArrival: true, cancelledDeparture: true })
      expect(stops.filter((s) => s.cancelledDeparture)).toHaveLength(1)
    }).pipe(Effect.provide(simulation(often))),
  )

  it('are the same for a seed', () => {
    const cancelled = (seed: number) =>
      worldAt({ ...settings, seed }, MOMENT).trips.flatMap((t) => (t.cancelled ? [t.trip.key] : []))
    expect(cancelled(1)).toEqual(cancelled(1))
    expect(cancelled(1).length).toBeGreaterThan(0)
  })
})

describe('extra trips', () => {
  it.effect('run behind a planned trip and show as additional on the departure board', () =>
    Effect.gen(function* () {
      const settings: SimulationSettings = { timetable, scenario: SCENARIOS.cap, seed: 1 }
      const extra = worldAt(settings, MOMENT).trips.find(
        (t) => t.extra && t.trip.calls[0].departure > MOMENT,
      )!
      const first = timetable.stops.platforms[extra.trip.calls[0].platform]
      const { body } = yield* call('multiDepartureBoard', { idList: first.id, duration: 120 })
      const departures = Schema.decodeUnknownSync(DepartureBoardAnswer)(JSON.parse(body)).Departure
      const row = departures?.find((d) => d.JourneyDetailRef.ref === refOf(extra))
      expect(row?.JourneyStatus).toBe('A')
    }).pipe(Effect.provide(simulation(SCENARIOS.cap))),
  )
})

describe('scheduled failures', () => {
  const failing = (kind: Scenario['failures'][number]['kind']): Scenario => ({
    ...WEEKDAY,
    name: kind,
    failures: [{ from: 0, to: 60, kind }],
  })

  it.effect('answer 503 in the patchy outage and recover after it', () =>
    Effect.gen(function* () {
      const during = yield* call('journeyPos', CITY, Date.UTC(2026, 5, 16, 5, 22))
      const after = yield* call('journeyPos', CITY, Date.UTC(2026, 5, 16, 5, 27))
      expect(during.status).toBe(503)
      expect(after.status).toBe(200)
    }).pipe(Effect.provide(simulation(SCENARIOS.patchy))),
  )

  it.effect('hang a timed-out call past any client timeout, then answer 504', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const fiber = yield* Effect.forkChild(request('journeyPos', CITY))
      yield* Effect.yieldNow
      yield* TestClock.adjust('10 seconds')
      expect(fiber.pollUnsafe()).toBeUndefined()
      yield* TestClock.adjust('30 seconds')
      expect((yield* Fiber.join(fiber)).status).toBe(504)
    }).pipe(Effect.provide(simulation(failing('timeout')))),
  )

  it.effect('answer an empty journeyPos with no list', () =>
    Effect.gen(function* () {
      const { status, body } = yield* call('journeyPos', CITY)
      expect(status).toBe(200)
      expect(JSON.parse(body).Journey).toBeUndefined()
    }).pipe(Effect.provide(simulation(failing('empty')))),
  )

  it.effect('answer as a refused key', () =>
    Effect.gen(function* () {
      const { status, body } = yield* call('himsearch', {})
      expect(status).toBe(401)
      expect(JSON.parse(body)).toMatchObject({ errorCode: 'API_AUTH' })
    }).pipe(Effect.provide(simulation(failing('refused-key')))),
  )

  it.effect('answer the spent scenario with the quota error from the first call', () =>
    Effect.gen(function* () {
      const { status, body } = yield* call('journeyPos', CITY)
      expect(status).toBe(403)
      expect(JSON.parse(body)).toMatchObject({ errorCode: 'API_QUOTA' })
    }).pipe(Effect.provide(simulation(SCENARIOS.spent))),
  )
})

describe('the named scenarios', () => {
  it.effect.each(Object.keys(SCENARIOS))('start %s from MYLDER_SOURCE', (name) =>
    Effect.gen(function* () {
      // Half past, clear of the patchy outage.
      const { status } = yield* call('journeyPos', CITY, Date.UTC(2026, 5, 16, 5, 30))
      expect(status).toBe(name === 'spent' ? 403 : 200)
    }).pipe(Effect.provide(apiLayer({ source: readSource(`simulated:${name}`), timetable }))),
  )

  it.effect('empty REPORT_ONLY in computed-only, while CALC_REPORT still answers', () =>
    Effect.gen(function* () {
      expect(yield* journeyRefs({ positionMode: 'REPORT_ONLY' })).toEqual([])
      expect((yield* journeyRefs()).length).toBeGreaterThan(0)
    }).pipe(Effect.provide(simulation(SCENARIOS['computed-only']))),
  )

  it.effect('fill maxJny in cap at a weekday peak on the real timetable', () =>
    Effect.gen(function* () {
      const real = yield* Effect.promise(() => loadTimetable())
      // 08:00 on the first Tuesday of the deployed timetable.
      const [tuesday] = real
        .serviceDaysAt(Date.parse(`${real.manifest.comparisonDay}T12:00:00Z`))
        .slice(-1)
      const peak = Date.parse(`${tuesday}T07:00:00Z`)
      const refs = yield* journeyRefs({ maxJny: 1000 }, peak).pipe(
        Effect.provide(SimulatedRejseplanen.layer({ timetable: real, scenario: SCENARIOS.cap })),
      )
      expect(refs).toHaveLength(1000)
    }),
  )
})
