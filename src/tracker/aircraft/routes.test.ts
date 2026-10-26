import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@effect/vitest'
import { Context, Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import * as Http from '../http'
import { recordedClient, recordingDir, type Recorded } from '../recording/layer'
import { Aircraft } from './aircraft'
import { aircraftAnswers } from './routes'
import { aircraftLayer } from './runtime'
import type { AircraftSnapshot } from './snapshot'
import { RECORDED_AIRCRAFT, readAircraftSource } from './source'

// GET /api/aircraft on the recorded feed and the test clock: each call the source makes takes
// the feed's next answer, so which answer a request is served tells how many calls were made.

const MOMENT = Date.UTC(2026, 5, 16, 5, 20)

/** An airliner on approach over Amager, broadcasting its own position `seen_pos` s ago. */
const plane = (hex: string, extra: object = {}) => ({
  hex,
  type: 'adsb_icao',
  flight: 'SAS1426 ',
  t: 'A20N',
  alt_baro: 3175,
  gs: 168.4,
  track: 223.6,
  category: 'A3',
  lat: 55.6743,
  lon: 12.6391,
  seen_pos: 0.4,
  ...extra,
})

const answer = (...ac: object[]): Recorded => ({ answer: { now: MOMENT, ac, msg: 'No error' } })

/** The aircraft source on a recording whose `aircraft/` folder holds `calls`, in order. */
const replaying = (...calls: Recorded[]) =>
  aircraftLayer({
    source: readAircraftSource('recording:test'),
    http: Http.layer(recordedClient(RECORDED_AIRCRAFT, new Map([['aircraft', calls]]))),
  })

/**
 * The aircraft source on the real feeds, adsb.lol then adsb.fi, both answered from one recorded
 * `aircraft/` folder in call order: a call each takes the next of `calls`.
 */
const feeds = (...calls: Recorded[]) =>
  aircraftLayer({
    source: readAircraftSource('adsblol'),
    http: Http.layer(recordedClient(RECORDED_AIRCRAFT, new Map([['aircraft', calls]]))),
  })

interface Answered {
  readonly status: number
  readonly headers: Headers
  readonly snapshot?: AircraftSnapshot
}

/** The route's answer now, run on the test's own services: its clock and its feed. */
const request = Effect.gen(function* () {
  const services = yield* Effect.context<Aircraft>()
  const answers = aircraftAnswers((use) =>
    Effect.runPromiseWith(services)(use(Context.get(services, Aircraft))),
  )
  return yield* Effect.promise(async (): Promise<Answered> => {
    const response = await answers.snapshot()
    const { status, headers } = response
    return response.ok
      ? { status, headers, snapshot: (await response.json()) as AircraftSnapshot }
      : { status, headers }
  })
})

const hexes = (answered: Answered) => answered.snapshot?.aircraft.map((each) => each.hex)

describe('GET /api/aircraft', () => {
  it.effect('two requests 5 s apart make one call; one 10 s after the first makes the next', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const first = yield* request
      yield* TestClock.adjust('5 seconds')
      const again = yield* request
      yield* TestClock.adjust('5 seconds')
      const next = yield* request
      expect([hexes(first), hexes(again), hexes(next)]).toEqual([
        ['aaa001'],
        ['aaa001'],
        ['bbb002'],
      ])
      expect(again.snapshot?.fetched).toBe(MOMENT)
      expect(next.snapshot?.fetched).toBe(MOMENT + 10_000)
    }).pipe(Effect.provide(replaying(answer(plane('aaa001')), answer(plane('bbb002'))))),
  )

  it.effect('requests at the same moment share one call', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const both = yield* Effect.all([request, request], { concurrency: 'unbounded' })
      expect(both.map(hexes)).toEqual([['aaa001'], ['aaa001']])
      yield* TestClock.adjust('10 seconds')
      expect(hexes(yield* request)).toEqual(['bbb002'])
    }).pipe(Effect.provide(replaying(answer(plane('aaa001')), answer(plane('bbb002'))))),
  )

  it.effect('keeps the aircraft in the box with a position of their own, and no others', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      expect(hexes(yield* request)).toEqual(['aaa001', 'ccc003'])
    }).pipe(
      Effect.provide(
        replaying(
          answer(
            plane('aaa001'),
            // Over Malmö, east of the box.
            plane('fff001', { lat: 55.6, lon: 13.0 }),
            // Its owner asked not to be shown: PIA, and LADD beside the military bit.
            plane('fff002', { dbFlags: 4 }),
            plane('fff003', { dbFlags: 9 }),
            // A follow-me car on the apron, and a tug in a surface category.
            plane('fff004', { type: 'adsb_icao_nt', alt_baro: 'ground', category: 'C2' }),
            plane('fff005', { alt_baro: 'ground', category: 'C1' }),
            // Placed only where the receiver that heard it stands.
            { hex: 'fff006', type: 'mode_s', alt_baro: 2300, rr_lat: 55.6, rr_lon: 12.6 },
            // Gone quiet, with only an old position over Ballerup.
            {
              hex: 'ccc003',
              type: 'adsb_icao',
              alt_baro: 11750,
              lastPosition: { lat: 55.73, lon: 12.36, seen_pos: 74.3 },
            },
          ),
        ),
      ),
    ),
  )

  it.effect(
    'gives each aircraft as codes and numbers, its position’s kind, its age and its state',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        const { snapshot } = yield* request
        expect(snapshot).toEqual({
          fetched: MOMENT,
          nextDue: MOMENT + 10_000,
          pollInterval: 10,
          provider: 'recording',
          health: { status: 'ok', since: MOMENT },
          lastAnswer: MOMENT,
          aircraft: [
            {
              hex: 'aaa001',
              callsign: 'SAS1426',
              type: 'A20N',
              lat: 55.6743,
              lon: 12.6391,
              altitude: 3175,
              speed: 168.4,
              track: 223.6,
              age: 0.4,
              source: 'broadcast',
              state: 'live',
            },
            {
              hex: 'aaa002',
              lat: 55.6743,
              lon: 12.6391,
              altitude: 'ground',
              age: 2,
              source: 'multilateration',
              state: 'estimated',
            },
            {
              hex: 'aaa003',
              lat: 55.6743,
              lon: 12.6391,
              age: 0.4,
              source: 'tisb',
              state: 'estimated',
            },
            {
              hex: 'aaa004',
              lat: 55.6743,
              lon: 12.6391,
              age: 0.4,
              source: 'other',
              state: 'estimated',
            },
            {
              hex: 'aaa005',
              lat: 55.6743,
              lon: 12.6391,
              age: 0.4,
              source: 'broadcast',
              state: 'live',
            },
          ],
        })
      }).pipe(
        Effect.provide(
          replaying(
            answer(
              plane('aaa001'),
              {
                hex: 'aaa002',
                type: 'mlat',
                alt_baro: 'ground',
                lat: 55.6743,
                lon: 12.6391,
                seen_pos: 2,
              },
              { hex: 'aaa003', type: 'tisb_trackfile', lat: 55.6743, lon: 12.6391, seen_pos: 0.4 },
              { hex: 'aaa004', type: 'mode_s', lat: 55.6743, lon: 12.6391, seen_pos: 0.4 },
              { hex: 'aaa005', type: 'adsr_icao', lat: 55.6743, lon: 12.6391, seen_pos: 0.4 },
            ),
          ),
        ),
      ),
  )

  it.effect('gives no callsign for readsb’s placeholder of one it hasn’t heard', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const { snapshot } = yield* request
      expect(snapshot?.aircraft.map(({ hex, callsign }) => ({ hex, callsign }))).toEqual([
        { hex: '511196', callsign: undefined },
        { hex: 'aaa001', callsign: 'SAS1426' },
      ])
    }).pipe(
      Effect.provide(
        replaying(
          answer(plane('aaa001'), plane('511196', { type: 'mlat', flight: '@@@@@@@@' })),
        ),
      ),
    ),
  )

  it.effect(
    'holds the answer at the CDN until its next due, never past it, dated when it was fetched',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        const first = yield* request
        expect(first.headers.get('Vercel-CDN-Cache-Control')).toBe(
          'max-age=10, stale-while-revalidate=0, stale-if-error=60',
        )
        expect(first.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
        expect(first.headers.get('Date')).toBe('Tue, 16 Jun 2026 05:20:00 GMT')
        yield* TestClock.adjust('4 seconds')
        const later = yield* request
        expect(later.headers.get('Vercel-CDN-Cache-Control')).toBe(
          'max-age=6, stale-while-revalidate=0, stale-if-error=60',
        )
      }).pipe(Effect.provide(replaying(answer(plane('aaa001'))))),
  )

  it.effect(
    'answers a failed call with health error and the last aircraft, aged by the clock',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        yield* request
        yield* TestClock.adjust('10 seconds')
        const failed = (yield* request).snapshot
        yield* TestClock.adjust('10 seconds')
        const still = yield* request
        expect(still.status).toBe(200)
        expect(failed?.health).toEqual({ status: 'error', kind: 'status', since: MOMENT + 10_000 })
        expect(still.snapshot?.health).toEqual(failed?.health)
        expect(still.snapshot?.lastAnswer).toBe(MOMENT)
        expect(still.snapshot?.aircraft.map(({ hex, age }) => ({ hex, age }))).toEqual([
          { hex: 'aaa001', age: 20.4 },
        ])
      }).pipe(Effect.provide(replaying(answer(plane('aaa001')), { status: 503 }))),
  )

  it.effect(
    'makes every aircraft No signal at its last fix once the feed has failed for 70 s',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        const answered = yield* request
        // The answer at 0 s, then a failure every 10 s from 10 s on.
        for (let call = 1; call <= 8; call++) {
          yield* TestClock.adjust('10 seconds')
          yield* request
        }
        const { snapshot } = yield* request
        const where = ({ hex, lat, lon }: { hex: string; lat: number; lon: number }) => ({
          hex,
          lat,
          lon,
        })
        expect(snapshot?.health).toEqual({
          status: 'error',
          kind: 'status',
          since: MOMENT + 10_000,
        })
        expect(snapshot?.aircraft.map((each) => ({ ...where(each), state: each.state }))).toEqual(
          answered.snapshot?.aircraft.map((each) => ({ ...where(each), state: 'no-signal' })),
        )
        expect(answered.snapshot?.aircraft.map(({ state }) => state)).toEqual(['live', 'estimated'])
      }).pipe(
        Effect.provide(
          replaying(
            answer(plane('aaa001'), plane('aaa002', { type: 'mlat', lat: 55.62, lon: 12.65 })),
            { status: 503 },
          ),
        ),
      ),
  )

  it.effect('drops an aircraft once its position is 5 min old', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* request
      yield* TestClock.adjust('290 seconds')
      expect(hexes(yield* request)).toEqual(['aaa001'])
      yield* TestClock.adjust('10 seconds')
      expect(hexes(yield* request)).toEqual([])
    }).pipe(Effect.provide(replaying(answer(plane('aaa001')), { status: 503 }))),
  )

  it.effect('gives up on each feed after 4 s, with none to show before the first answer', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const fiber = yield* Effect.forkChild(request)
      yield* TestClock.adjust('4 seconds')
      yield* TestClock.adjust('4 seconds')
      const { snapshot } = yield* Fiber.join(fiber)
      expect(snapshot?.health).toEqual({ status: 'error', kind: 'timeout', since: MOMENT + 8_000 })
      expect(snapshot?.aircraft).toEqual([])
      expect(snapshot).not.toHaveProperty('lastAnswer')
      // Nobody has answered, so the snapshot names nobody.
      expect(snapshot).not.toHaveProperty('provider')
    }).pipe(Effect.provide(replaying({ timeout: true }))),
  )

  it.effect('counts an answer the schema rejects as a body error', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      expect((yield* request).snapshot?.health).toMatchObject({ status: 'error', kind: 'body' })
    }).pipe(Effect.provide(replaying({ answer: { now: MOMENT, msg: 'No error' } }))),
  )

  it.effect(
    "replays a recording's aircraft folder for MYLDER_AIRCRAFT_SOURCE=recording:<folder>",
    () =>
      Effect.gen(function* () {
        const dir = recordingDir('weekday')
        const read = (path: string): unknown => JSON.parse(readFileSync(join(dir, path), 'utf8'))
        const { start } = read('clock.json') as { start: string }
        yield* TestClock.setTime(Date.parse(start))
        expect((yield* request).snapshot).toEqual(read('answers/aircraft/0001.json'))
      }).pipe(Effect.provide(aircraftLayer({ source: readAircraftSource('recording:weekday') }))),
  )

  it.effect(
    'answers from adsb.fi when adsb.lol answers 503, names it, and asks adsb.lol next',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MOMENT)
        const fallen = (yield* request).snapshot
        expect(fallen?.provider).toBe('adsb.fi')
        expect(fallen?.health).toEqual({ status: 'ok', since: MOMENT })
        expect(fallen?.lastAnswer).toBe(MOMENT)
        expect(fallen?.aircraft.map(({ hex }) => hex)).toEqual(['fff001'])
        yield* TestClock.adjust('10 seconds')
        const next = (yield* request).snapshot
        expect([next?.provider, next?.aircraft.map(({ hex }) => hex)]).toEqual([
          'adsb.lol',
          ['aaa001'],
        ])
      }).pipe(
        Effect.provide(feeds({ status: 503 }, answer(plane('fff001')), answer(plane('aaa001')))),
      ),
  )

  it.effect('answers from adsb.fi when adsb.lol answers 429, and names it', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const answered = yield* request
      expect(answered.snapshot?.provider).toBe('adsb.fi')
      expect(answered.snapshot?.health.status).toBe('ok')
      expect(hexes(answered)).toEqual(['fff001'])
    }).pipe(Effect.provide(feeds({ status: 429 }, answer(plane('fff001'))))),
  )

  it.effect('after a 429 asks adsb.fi alone for the rest of the UTC day, then adsb.lol again', () =>
    Effect.gen(function* () {
      const midnight = Date.UTC(2026, 5, 17)
      // Each call takes the folder's next answer, so a call to adsb.lol would be named for it.
      const providers: Array<string | undefined> = []
      yield* TestClock.setTime(MOMENT)
      providers.push((yield* request).snapshot?.provider)
      yield* TestClock.adjust('10 seconds')
      providers.push((yield* request).snapshot?.provider)
      yield* TestClock.setTime(midnight - 10_000)
      providers.push((yield* request).snapshot?.provider)
      yield* TestClock.setTime(midnight)
      const next = yield* request
      providers.push(next.snapshot?.provider)
      expect(providers).toEqual(['adsb.fi', 'adsb.fi', 'adsb.fi', 'adsb.lol'])
      expect(hexes(next)).toEqual(['ddd004'])
    }).pipe(
      Effect.provide(
        feeds(
          { status: 429 },
          answer(plane('aaa001')),
          answer(plane('bbb002')),
          answer(plane('ccc003')),
          answer(plane('ddd004')),
        ),
      ),
    ),
  )

  for (const [as, retryAfter] of [
    ['in seconds', '120'],
    ['as a date', 'Tue, 16 Jun 2026 05:22:00 GMT'],
  ]) {
    it.effect(`after a 429 with Retry-After ${as} asks adsb.lol again once it has passed`, () =>
      Effect.gen(function* () {
        const providers: Array<string | undefined> = []
        yield* TestClock.setTime(MOMENT)
        providers.push((yield* request).snapshot?.provider)
        yield* TestClock.setTime(MOMENT + 110_000)
        providers.push((yield* request).snapshot?.provider)
        yield* TestClock.setTime(MOMENT + 120_000)
        providers.push((yield* request).snapshot?.provider)
        expect(providers).toEqual(['adsb.fi', 'adsb.fi', 'adsb.lol'])
      }).pipe(
        Effect.provide(
          feeds(
            { status: 429, headers: { 'retry-after': retryAfter } },
            answer(plane('aaa001')),
            answer(plane('bbb002')),
            answer(plane('ccc003')),
          ),
        ),
      ),
    )
  }

  it.effect('answers from adsb.fi within adsb.lol’s 4 s timeout and its own call', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const fiber = yield* Effect.forkChild(request)
      yield* TestClock.adjust('4 seconds')
      const { snapshot } = yield* Fiber.join(fiber)
      expect(snapshot?.provider).toBe('adsb.fi')
      expect(snapshot?.fetched).toBe(MOMENT + 4_000)
      expect(snapshot?.health).toEqual({ status: 'ok', since: MOMENT + 4_000 })
      expect(snapshot?.aircraft.map(({ hex }) => hex)).toEqual(['fff001'])
    }).pipe(Effect.provide(feeds({ timeout: true }, answer(plane('fff001'))))),
  )

  it.effect('gives health error when both fail, naming who gave the aircraft it keeps', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* request
      yield* TestClock.adjust('10 seconds')
      const { status, snapshot } = yield* request
      expect(status).toBe(200)
      expect(snapshot?.health).toEqual({ status: 'error', kind: 'status', since: MOMENT + 10_000 })
      expect(snapshot?.provider).toBe('adsb.lol')
      expect(snapshot?.lastAnswer).toBe(MOMENT)
      expect(snapshot?.aircraft.map(({ hex }) => hex)).toEqual(['aaa001'])
    }).pipe(Effect.provide(feeds(answer(plane('aaa001')), { status: 503 }, { status: 502 }))),
  )

  it.effect('answers 404 when MYLDER_AIRCRAFT_SOURCE is off', () =>
    Effect.gen(function* () {
      const answered = yield* request
      expect(answered.status).toBe(404)
      expect(answered.headers.get('Cache-Control')).toBe('no-store')
    }).pipe(Effect.provide(aircraftLayer({ source: readAircraftSource('off') }))),
  )
})

describe('MYLDER_AIRCRAFT_SOURCE', () => {
  it('is adsb.lol by default, a recording by its folder, or off', () => {
    expect(readAircraftSource(undefined)).toEqual({ kind: 'adsblol' })
    expect(readAircraftSource(' ')).toEqual({ kind: 'adsblol' })
    expect(readAircraftSource('adsblol')).toEqual({ kind: 'adsblol' })
    expect(readAircraftSource('recording:weekday')).toEqual({
      kind: 'recording',
      folder: 'weekday',
    })
    expect(readAircraftSource('off')).toEqual({ kind: 'off' })
    expect(() => readAircraftSource('opensky')).toThrow(
      'MYLDER_AIRCRAFT_SOURCE="opensky" is none of adsblol, recording:<folder> or off',
    )
  })
})
