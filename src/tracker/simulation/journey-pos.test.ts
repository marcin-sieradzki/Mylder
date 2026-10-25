import { describe, expect, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import { HttpClient } from '../rejseplanen/http'
import { TestClock } from 'effect/testing'
import type { LatLon } from '../../domain/trip-motion'
import { COPENHAGEN_BOX, type Box } from '../../timetable/format'
import { patternPath } from '../../timetable/paths'
import { JourneyPosAnswer, type PositionJourney } from '../rejseplanen/answers'
import { apiLayer, readSource } from '../source'
import { fixtureTimetable } from '../testing'
import { NOISE } from './journey-pos'
import * as SimulatedRejseplanen from './layer'

// 07:20 in Copenhagen on Tuesday 2026-06-16, when the fixture has seventeen trips underway.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)

const timetable = await fixtureTimetable()

interface Query {
  readonly box?: Box
  readonly positionMode?: string
  readonly products?: number
  readonly maxJny?: number
}

/** Calls `journeyPos` at a moment through whatever `HttpClient` is provided. */
const journeyPos = (query: Query = {}, moment = MOMENT) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(moment)
    const { box = COPENHAGEN_BOX, positionMode = 'CALC_REPORT', products = 3839 } = query
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get('https://www.rejseplan.dk/api/journeyPos', {
      urlParams: {
        format: 'json',
        llLat: box.south,
        llLon: box.west,
        urLat: box.north,
        urLon: box.east,
        positionMode,
        products,
        ...(query.maxJny ? { maxJny: query.maxJny } : {}),
      },
    })
    const body = yield* response.text
    return { status: response.status, body }
  })

const answer = (query?: Query, moment?: number) =>
  journeyPos(query, moment).pipe(
    Effect.map(({ body }) => Schema.decodeUnknownSync(JourneyPosAnswer)(JSON.parse(body))),
    Effect.map((decoded) => decoded.Journey ?? []),
  )

const simulation = (seed?: number) => SimulatedRejseplanen.layer({ timetable, seed })

const refs = (journeys: readonly PositionJourney[]) => journeys.map((j) => j.JourneyDetailRef.ref)

/** How far a point lies from a polyline, in metres, near enough across a city. */
function distanceToPath([lat, lon]: LatLon, points: readonly LatLon[]): number {
  const metres = ([a, b]: LatLon): [number, number] => [
    (b - lon) * 111_320 * Math.cos((lat * Math.PI) / 180),
    (a - lat) * 111_320,
  ]
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = metres(points[i - 1])
    const [bx, by] = metres(points[i])
    const length = (bx - ax) ** 2 + (by - ay) ** 2
    const t =
      length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / length))
    best = Math.min(best, Math.hypot(ax + t * (bx - ax), ay + t * (by - ay)))
  }
  return best
}

/** How far a journey's position lies from its own pattern, the one that calls at its stops. */
function distanceFromPattern(journey: PositionJourney): number {
  const { platforms } = timetable.stops
  const stops = (journey.Stops?.Stop ?? []).map((stop) => stop.extId)
  const own = timetable.patterns.patterns.filter(
    (pattern) =>
      timetable.patterns.lines[pattern.line].name === journey.Product?.[0].line &&
      stops.every((id) => pattern.stops.some((platform) => platforms[platform].id === id)),
  )
  expect(own.length).toBeGreaterThan(0)
  return Math.min(
    ...own.map((pattern) =>
      distanceToPath([journey.lat, journey.lon], patternPath(pattern, timetable.paths).points),
    ),
  )
}

describe('the source switch', () => {
  it('runs the weekday simulation when MYLDER_SOURCE is unset', () => {
    expect(readSource(undefined)).toEqual({ kind: 'simulated', scenario: 'weekday' })
    expect(readSource('simulated')).toEqual({ kind: 'simulated', scenario: 'weekday' })
    expect(readSource('simulated:weekday')).toEqual({ kind: 'simulated', scenario: 'weekday' })
    expect(readSource('recording:recordings/weekday')).toEqual({
      kind: 'recording',
      folder: 'recordings/weekday',
    })
    expect(readSource('rejseplanen')).toEqual({ kind: 'rejseplanen' })
  })

  it('refuses a setting it does not know', () => {
    expect(() => readSource('live')).toThrow(/MYLDER_SOURCE="live"/)
    expect(() => readSource('recording:')).toThrow(/MYLDER_SOURCE/)
  })

  it.effect('answers journeyPos from the simulation by default', () =>
    Effect.gen(function* () {
      const { status } = yield* journeyPos()
      const journeys = yield* answer()
      expect(status).toBe(200)
      expect(journeys.length).toBeGreaterThan(0)
    }).pipe(Effect.provide(apiLayer({ source: readSource(undefined), timetable }))),
  )

  it.effect('answers as a refused key on rejseplanen with no key, never simulating', () =>
    Effect.gen(function* () {
      const { status, body } = yield* journeyPos()
      expect(status).toBe(401)
      expect(JSON.parse(body)).toMatchObject({ errorCode: 'API_AUTH' })
    }).pipe(Effect.provide(apiLayer({ source: readSource('rejseplanen'), timetable }))),
  )

  it('names the scenarios there are when one is unknown', () => {
    expect(() => apiLayer({ source: readSource('simulated:holiday'), timetable })).toThrow(
      /No simulated scenario "holiday"; there are weekday/,
    )
  })
})

describe('the simulated journeyPos', () => {
  it.effect('decodes with the live schema and puts every position on its line, in the box', () =>
    Effect.gen(function* () {
      const journeys = yield* answer()
      expect(journeys.length).toBeGreaterThanOrEqual(10)
      for (const journey of journeys) {
        const { lat, lon } = journey
        expect(lat).toBeGreaterThanOrEqual(COPENHAGEN_BOX.south)
        expect(lat).toBeLessThanOrEqual(COPENHAGEN_BOX.north)
        expect(lon).toBeGreaterThanOrEqual(COPENHAGEN_BOX.west)
        expect(lon).toBeLessThanOrEqual(COPENHAGEN_BOX.east)
        expect(distanceFromPattern(journey)).toBeLessThanOrEqual(NOISE * Math.SQRT2 + 0.5)
      }
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('carries in REPORT_ONLY a subset of CALC_REPORT, with no Metro trip', () =>
    Effect.gen(function* () {
      const reported = yield* answer({ positionMode: 'REPORT_ONLY' })
      const all = yield* answer({ positionMode: 'CALC_REPORT' })
      expect(reported.length).toBeGreaterThan(0)
      expect(reported.length).toBeLessThan(all.length)
      expect(refs(all)).toEqual(expect.arrayContaining(refs(reported)))
      expect(reported.some((j) => j.Product?.[0].cls === '1024')).toBe(false)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('leaves the Metro out of every answer, as an interval line', () =>
    Effect.gen(function* () {
      const all = yield* answer({ positionMode: 'CALC_REPORT' })
      expect(all.some((j) => j.Product?.[0].cls === '1024')).toBe(false)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('places a computed position on the path and a reported one a few metres off', () =>
    Effect.gen(function* () {
      const reported = new Set(refs(yield* answer({ positionMode: 'REPORT_ONLY' })))
      const calc = yield* answer({ positionMode: 'CALC' })
      const computed = calc.filter((j) => !reported.has(j.JourneyDetailRef.ref))
      for (const journey of calc) expect(distanceFromPattern(journey)).toBeLessThan(0.5)
      const noisy = (yield* answer({ positionMode: 'CALC_REPORT' })).filter((j) =>
        reported.has(j.JourneyDetailRef.ref),
      )
      expect(computed.length + noisy.length).toBeGreaterThan(0)
      expect(noisy.some((j) => distanceFromPattern(j) > 0.5)).toBe(true)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('gives each journey the call it left and the next few, late by whole minutes', () =>
    Effect.gen(function* () {
      const journeys = yield* answer()
      const stops = journeys.map((j) => j.Stops?.Stop ?? [])
      expect(stops.every((each) => each.length >= 2 && each.length <= 4)).toBe(true)
      const late = stops.flat().filter((stop) => stop.rtDepTime !== undefined)
      expect(late.length).toBeGreaterThan(0)
      for (const stop of late) {
        expect(stop.depPrognosisType).toBe('PROGNOSED')
        expect(stop.rtDepTime).toMatch(/^\d\d:\d\d:00$/)
        expect(stop.rtDepTime).not.toBe(stop.depTime)
      }
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('places a trip Waiting at its first stop, standing still', () =>
    Effect.gen(function* () {
      // The RE leaves København H at 07:17; from 07:12 it stands Waiting there.
      const re = (journeys: readonly PositionJourney[]) =>
        journeys.find((j) => j.trainNumber === '2427')!
      const first = re(yield* answer({}, Date.UTC(2026, 5, 16, 5, 13)))
      const second = re(yield* answer({}, Date.UTC(2026, 5, 16, 5, 14)))
      expect(first.JourneyOrigin?.name).toBe('København H')
      const { lat, lon } = first.JourneyOrigin!
      const from = (point: LatLon, j: PositionJourney) =>
        distanceToPath([j.lat, j.lon], [point, point])
      expect(from([lat, lon], first)).toBeLessThan(100)
      expect(from([first.lat, first.lon], second)).toBeLessThan(2 * NOISE * Math.SQRT2)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('keeps to the box asked for', () =>
    Effect.gen(function* () {
      const box = { south: 55.6, west: 12.45, north: 55.72, east: 12.62 }
      const inner = yield* answer({ box })
      const all = yield* answer()
      expect(inner.length).toBeGreaterThan(0)
      expect(inner.length).toBeLessThan(all.length)
      for (const { lat, lon } of inner) {
        expect(lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east).toBe(
          true,
        )
      }
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('keeps to the products asked for', () =>
    Effect.gen(function* () {
      const stog = yield* answer({ products: 16 })
      expect(stog.length).toBeGreaterThan(0)
      expect(stog.every((j) => j.Product?.[0].cls === '16')).toBe(true)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('stops at maxJny when the box holds more', () =>
    Effect.gen(function* () {
      const all = yield* answer()
      expect(all.length).toBeGreaterThan(3)
      expect(yield* answer({ maxJny: 3 })).toHaveLength(3)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('gives the same bytes for the same scenario, seed and moment', () =>
    Effect.gen(function* () {
      const first = yield* journeyPos({ positionMode: 'REPORT_ONLY' })
      const second = yield* journeyPos({ positionMode: 'REPORT_ONLY' })
      expect(second.body).toBe(first.body)
      const other = yield* journeyPos({ positionMode: 'REPORT_ONLY' }).pipe(
        Effect.provide(simulation(2)),
      )
      expect(other.body).not.toBe(first.body)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('gives each journey a stable reference carrying its line and ends', () =>
    Effect.gen(function* () {
      const now = yield* answer()
      const later = yield* answer({}, MOMENT + 2 * 60_000)
      const shared = refs(now).filter((ref) => refs(later).includes(ref))
      expect(shared.length).toBeGreaterThan(0)
      const [ref] = refs(now)
      expect(ref).toMatch(/^2\|#VN#1#ST#\d+#PI#0#ZI#\d+#TA#0#DA#160626#/)
      expect(ref).toMatch(/#ZE#[^#]+#.*#FR#\d+#FT#\d+#TO#\d+#TT#\d+#$/)
    }).pipe(Effect.provide(simulation())),
  )

  it.effect('moves trips on from one minute to the next', () =>
    Effect.gen(function* () {
      const byRef = (journeys: readonly PositionJourney[]) =>
        new Map(journeys.map((j) => [j.JourneyDetailRef.ref, j]))
      const now = byRef(yield* answer({ positionMode: 'CALC' }))
      const later = byRef(yield* answer({ positionMode: 'CALC' }, MOMENT + 60_000))
      const moved = [...now].filter(([ref, j]) => {
        const next = later.get(ref)
        return next && (next.lat !== j.lat || next.lon !== j.lon)
      })
      expect(moved.length).toBeGreaterThan(now.size / 2)
    }).pipe(Effect.provide(simulation())),
  )
})

describe('the simulation at night', () => {
  it.effect('answers with no journeys when nothing runs', () =>
    Effect.gen(function* () {
      const night = yield* answer({}, Date.UTC(2026, 5, 16, 1, 0))
      expect(night).toEqual([])
    }).pipe(Effect.provide(simulation())),
  )
})
