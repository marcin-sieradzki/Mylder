import { describe, expect, it } from '@effect/vitest'
import { Effect, type Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { pacing } from './budget'
import { joinJourney } from './join'
import type { PositionJourney, Service } from './rejseplanen/answers'
import { callsKey } from './rejseplanen/client'
import * as Http from './rejseplanen/http'
import { keyPrefixOf, trackerLayer } from './runtime'
import { readSource } from './source'
import { simulatedClient } from './simulation/layer'
import { WEEKDAY } from './simulation/scenarios'
import { Store } from './store'
import { fixtureTimetable } from './testing'
import { Tracker } from './tracker'

// A trip's on-demand detail (docs/live-data.md, "The budget"): one `journeyDetail` call for the
// trip's reference when the budget allows it, cached a minute, inside the ten on-demand calls a
// minute it shares with the stops, else the timetable plus the snapshot's delay. 07:20 in
// Copenhagen on Tuesday 2026-06-16, on the simulated Rejseplanen.
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

/** The month's calls of one service so far, from the store's counter. */
const callsOf = (service: Service) =>
  Effect.gen(function* () {
    const calls = yield* (yield* Store).get(callsKey(prefix, '2026-06', service))
    return typeof calls === 'number' ? calls : 0
  })

const detail = (tripKey: string) =>
  Effect.gen(function* () {
    return yield* (yield* Tracker).getTripDetail(tripKey)
  })

/** The snapshot's trips that have been in a position answer, the Metro aside. */
const seenTrips = Effect.gen(function* () {
  const { trips } = yield* (yield* Tracker).getSnapshot
  return trips.filter((trip) => trip.journey !== undefined && trip.mode !== 'metro')
})

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

/** The simulated Rejseplanen on a weekday where every trip of three calls or more skips one. */
const skipping = Http.layer(
  simulatedClient({ timetable, scenario: { ...WEEKDAY, name: 'skipping', cancelledCall: 1 } }),
)

/** Stops with buses or S-tog leaving in the next half hour. */
const BUSY_STOPS = ['718', '1957', '1958', '1959', '1969']

/** København H, which the simulated S-tog signal fault names, with Hellerup. */
const KOBENHAVN_H = '8600626'
const HELLERUP = '8600655'

/** The Stop a call is at, by its id. */
const stopOf = (platform: string) => timetable.stops.stopForPlatform(platform)?.id

/**
 * The simulated Rejseplanen with one journey misread: the `truth` trip's journey carries a
 * reference whose fields name the `guess` trip, as alike trips can leave the join, under its own
 * journey number, and the guess's own journey is left out. Both are picked from the first
 * answer: underway trips of the same mode that run past the next ten minutes.
 */
const misreading = () => {
  const simulation = simulatedClient({ timetable })
  const picked: { guess?: PositionJourney; truth?: PositionJourney } = {}
  const tripOf = (journey: PositionJourney) => joinJourney(timetable, journey)?.trip
  const runs = (journey: PositionJourney) => {
    const trip = tripOf(journey)
    return (
      trip !== undefined &&
      trip.line.mode === 'bus' &&
      trip.calls[0].departure < MOMENT &&
      trip.calls.at(-1)!.arrival > MOMENT + 10 * 60_000
    )
  }
  const client = Http.client((request, url) =>
    Effect.gen(function* () {
      const response = yield* simulation.execute(request)
      if (!url.pathname.endsWith('journeyPos')) return response
      const answer = (yield* response.json) as { Journey?: PositionJourney[] }
      const journeys = answer.Journey ?? []
      if (!picked.guess) [picked.guess, picked.truth] = journeys.filter(runs)
      const guess = tripOf(picked.guess!)!
      const truth = tripOf(picked.truth!)!
      const number = /#ZI#\d+#/.exec(picked.truth!.JourneyDetailRef.ref)![0]
      const misread = picked.guess!.JourneyDetailRef.ref.replace(/#ZI#\d+#/, number)
      const Journey = journeys.flatMap((journey) => {
        const key = tripOf(journey)?.key
        if (key === guess.key) return []
        if (key !== truth.key) return [journey]
        return [{ ...journey, JourneyDetailRef: { ref: misread }, direction: guess.headsign }]
      })
      return Http.json(request, 200, { ...answer, Journey })
    }).pipe(Effect.orDie),
  )
  return {
    layer: Http.layer(client),
    picked: () => [tripOf(picked.guess!)!, tripOf(picked.truth!)!],
  }
}

describe('a trip’s on-demand detail', () => {
  it.effect('makes one detail call for a trip opened twice in a minute', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const [trip] = yield* seenTrips
      const first = (yield* detail(trip.key))!
      expect(first.key).toBe(trip.key)
      expect(first.source).toEqual({ kind: 'rejseplanen', at: MOMENT })
      yield* TestClock.adjust('30 seconds')
      expect((yield* detail(trip.key))?.source).toEqual({ kind: 'rejseplanen', at: MOMENT })
      expect(yield* callsOf('journeyDetail')).toBe(1)
      // A minute after the call, the next viewer gets a fresh one.
      yield* TestClock.adjust('30 seconds')
      expect((yield* detail(trip.key))?.source).toEqual({
        kind: 'rejseplanen',
        at: MOMENT + 60_000,
      })
      expect(yield* callsOf('journeyDetail')).toBe(2)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('shares the limit of ten on-demand calls a minute with the stops', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const trips = (yield* seenTrips).slice(0, 6)
      const sources = []
      for (const stop of BUSY_STOPS) {
        sources.push((yield* (yield* Tracker).getStopDepartures(stop))?.source.kind)
      }
      for (const trip of trips) sources.push((yield* detail(trip.key))?.source.kind)
      expect(sources).toEqual([...Array(10).fill('rejseplanen'), 'timetable'])
      expect(yield* callsOf('journeyDetail')).toBe(5)
      // The next minute has room again.
      yield* TestClock.adjust('60 seconds')
      expect((yield* detail(trips[5].key))?.source.kind).toBe('rejseplanen')
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
        const late = (yield* seenTrips).find((trip) => trip.delay !== undefined && trip.delay > 0)!
        const answer = (yield* detail(late.key))!
        expect(answer.source).toEqual({ kind: 'timetable' })
        expect(answer.delay).toBe(late.delay)
        const call = answer.calls[late.next[0].index]
        expect(call.expectedDeparture! - call.departure).toBe(late.delay! * 1000)
        expect(answer.messages).toBeUndefined()
        expect(yield* callsOf('journeyDetail')).toBe(0)
      }).pipe(Effect.provide(tracker())),
  )

  it.effect('answers from the timetable when the detail call fails', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const [trip] = yield* seenTrips
      const answer = (yield* detail(trip.key))!
      expect(answer.key).toBe(trip.key)
      expect(answer.source).toEqual({ kind: 'timetable' })
      expect(answer.calls.length).toBeGreaterThan(1)
      // A 503 is tried once more, and both count.
      expect(yield* callsOf('journeyDetail')).toBe(2)
    }).pipe(Effect.provide(tracker(failing('journeyDetail')))),
  )

  it.effect('makes no call for a trip no answer has carried', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const { trips } = yield* (yield* Tracker).getSnapshot
      const unseen = trips.find((trip) => trip.journey === undefined)!
      expect((yield* detail(unseen.key))?.source).toEqual({ kind: 'timetable' })
      expect(yield* callsOf('journeyDetail')).toBe(0)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('carries the detail’s expected times, Rejseplanen’s delay and a skipped call', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const late = (yield* seenTrips).find(
        (trip) => trip.delay !== undefined && trip.delay >= 60 && trip.next.length === 3,
      )!
      const answer = (yield* detail(late.key))!
      expect(answer.source.kind).toBe('rejseplanen')
      // The simulation rounds a delay to whole minutes, as Rejseplanen's times are given.
      const next = answer.calls[late.next[0].index]
      expect(answer.nextCallDelay).toBe(Math.round(late.delay! / 60) * 60)
      expect(next.expectedDeparture! - next.departure).toBe(answer.nextCallDelay! * 1000)
      // Every trip skips one call here, never its first or last; it stays in the list, marked.
      const skipped = answer.calls.filter((call) => call.cancelled)
      expect(skipped).toHaveLength(1)
      expect(skipped[0].index).toBeGreaterThan(0)
      expect(skipped[0].index).toBeLessThan(answer.calls.length - 1)
      expect(skipped[0].expectedDeparture).toBeUndefined()
      expect(answer.cancelled).toBeUndefined()
    }).pipe(Effect.provide(tracker(skipping))),
  )

  it.effect('gives the trip’s own messages, each with the calls it covers', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const named = new Set([stopOf(KOBENHAVN_H), stopOf(HELLERUP)])
      // An S-tog through København H and Hellerup, which the signal fault covers.
      for (const trip of (yield* seenTrips).filter((each) => each.mode === 's-tog')) {
        const answer = (yield* detail(trip.key))!
        const at = answer.calls.flatMap((call) =>
          named.has(stopOf(call.stop)) ? [call.index] : [],
        )
        if (at.length < 2) continue
        expect(answer.source.kind).toBe('rejseplanen')
        expect(answer.messages).toEqual([
          expect.objectContaining({
            fieldsKind: 'service-notice',
            message: expect.objectContaining({
              id: 'simulated-2',
              head: 'Færre S-tog mellem København H og Hellerup',
            }),
            calls: { first: at[0], last: at.at(-1) },
          }),
        ])
        return
      }
      expect.unreachable('no S-tog on the map runs through København H and Hellerup')
    }).pipe(Effect.provide(tracker())),
  )

  const misread = misreading()
  it.effect('answers for the trip a detail’s calls fit, and the next run joins it so', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const first = new Map((yield* (yield* Tracker).getSnapshot).trips.map((t) => [t.key, t]))
      const [guess, truth] = misread.picked()
      // The first guess: the truth's journey is drawn as the guess.
      expect(first.get(guess.key)?.hadRealtime).toBe(true)
      expect(first.get(truth.key)?.hadRealtime).not.toBe(true)
      const answer = (yield* detail(guess.key))!
      expect(answer.source.kind).toBe('rejseplanen')
      expect(answer.key).toBe(truth.key)
      expect(answer.calls.map((call) => call.departure)).toEqual(
        truth.calls.map((call) => call.departure),
      )
      // The vehicle the viewer opened keeps its state.
      expect(answer.state).toBe(first.get(guess.key)!.state)
      // The next run joins the journey to the trip it is, with what earlier runs saw of it.
      yield* TestClock.adjust('60 seconds')
      const next = new Map((yield* (yield* Tracker).getSnapshot).trips.map((t) => [t.key, t]))
      expect(next.get(truth.key)).toMatchObject({ hadRealtime: true, seen: MOMENT + 60_000 })
      expect(next.get(guess.key)?.hadRealtime ?? false).toBe(false)
      expect((yield* detail(truth.key))?.key).toBe(truth.key)
    }).pipe(Effect.provide(tracker(misread.layer))),
  )
})
