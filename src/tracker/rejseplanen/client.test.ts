import { describe, expect, it } from '@effect/vitest'
import { Effect, Exit, Fiber, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { COPENHAGEN_BOX } from '../../timetable/format'
import * as Http from '../http'
import { memoryLayer, Store } from '../store'
import { layer as rejseplanenLayer, Rejseplanen, type CallError } from './client'
import { errorAnswer } from './responses'

const KEY = 'secret-key-123'

const query = {
  box: COPENHAGEN_BOX,
  products: 3839,
  positionMode: 'REPORT_ONLY',
  maxJny: 1000,
} as const

/** Rejseplanen answering each request with the next of `answers`, the last one repeated. */
function answering(answers: ((request: Http.Request) => Effect.Effect<Http.Response>)[]) {
  let calls = 0
  const urls: string[] = []
  const client = Http.client((request, url) => {
    urls.push(url.toString())
    const answer = answers[Math.min(calls++, answers.length - 1)]
    return answer(request)
  })
  const layer = rejseplanenLayer({
    key: KEY,
    counterPrefix: 'test',
    monthOf: () => '2026-10',
  }).pipe(Layer.provideMerge(memoryLayer), Layer.provide(Http.layer(client)))
  return { layer, urls }
}

const ok = (request: Http.Request) => Effect.succeed(Http.json(request, 200, { Journey: [] }))
const status = (code: number) => (request: Http.Request) =>
  Effect.succeed(Http.json(request, code, {}))

const callCount = Effect.gen(function* () {
  const store = yield* Store
  return yield* store.get('test:calls:2026-10')
})

/** A call's failure, which the test expects. */
const failure = <A>(effect: Effect.Effect<A, CallError>) => Effect.flip(effect)

describe('the Rejseplanen client', () => {
  it.effect('asks journeyPos for the box with the key, and decodes its answer', () => {
    const { layer, urls } = answering([ok])
    return Effect.gen(function* () {
      const rejseplanen = yield* Rejseplanen
      const { answer, attempts } = yield* rejseplanen.journeyPos(query)
      expect(answer).toEqual({ Journey: [] })
      expect(attempts).toBe(1)
      const url = new URL(urls[0])
      expect(url.pathname).toBe('/api/journeyPos')
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        accessId: KEY,
        format: 'json',
        llLat: '55.45',
        urLon: '12.7',
        products: '3839',
        positionMode: 'REPORT_ONLY',
        maxJny: '1000',
      })
      expect(yield* callCount).toBe(1)
    }).pipe(Effect.provide(layer))
  })

  it.effect('asks himsearch for the products with the key, counted under its own service', () => {
    const message = { id: 'm1', head: 'Signalfejl ved Østerport', category: '1' }
    const { layer, urls } = answering([
      (request) => Effect.succeed(Http.json(request, 200, { Message: [message] })),
    ])
    return Effect.gen(function* () {
      const { answer } = yield* (yield* Rejseplanen).himsearch({ products: 3839 })
      expect(answer.Message).toEqual([message])
      const url = new URL(urls[0])
      expect(url.pathname).toBe('/api/himsearch')
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        accessId: KEY,
        format: 'json',
        products: '3839',
      })
      expect(yield* callCount).toBe(1)
      expect(yield* (yield* Store).get('test:calls:2026-10:himsearch')).toBe(1)
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'asks multiDepartureBoard for every platform at once, counted under its service',
    () => {
      const departure = {
        JourneyDetailRef: { ref: '2|#ZI#1#' },
        name: 'Bus 5C',
        stop: 'Nørreport St.',
        stopExtId: '8603307',
        time: '07:24:00',
        date: '2026-06-16',
        rtTime: '07:26:00',
      }
      const { layer, urls } = answering([
        (request) => Effect.succeed(Http.json(request, 200, { Departure: [departure] })),
      ])
      return Effect.gen(function* () {
        const { answer } = yield* (yield* Rejseplanen).multiDepartureBoard({
          ids: ['8603307', '8603308'],
          duration: 30,
        })
        expect(answer.Departure).toEqual([departure])
        const url = new URL(urls[0])
        expect(url.pathname).toBe('/api/multiDepartureBoard')
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
          accessId: KEY,
          format: 'json',
          idList: '8603307|8603308',
          duration: '30',
        })
        expect(yield* (yield* Store).get('test:calls:2026-10:multiDepartureBoard')).toBe(1)
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    'asks multiArrivalBoard for every platform at once, counted under its own service',
    () => {
      const arrival = {
        JourneyDetailRef: { ref: '2|#ZI#1#' },
        name: 'Bus 5C',
        stop: 'Nørreport St.',
        stopExtId: '8603307',
        time: '07:24:00',
        date: '2026-06-16',
        rtTime: '07:26:00',
        origin: 'Husum Torv',
      }
      const { layer, urls } = answering([
        (request) => Effect.succeed(Http.json(request, 200, { Arrival: [arrival] })),
      ])
      return Effect.gen(function* () {
        const { answer } = yield* (yield* Rejseplanen).multiArrivalBoard({
          ids: ['8603307', '8603308'],
          duration: 30,
        })
        expect(answer.Arrival).toEqual([arrival])
        const url = new URL(urls[0])
        expect(url.pathname).toBe('/api/multiArrivalBoard')
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
          accessId: KEY,
          format: 'json',
          idList: '8603307|8603308',
          duration: '30',
        })
        expect(yield* (yield* Store).get('test:calls:2026-10:multiArrivalBoard')).toBe(1)
        expect(yield* (yield* Store).get('test:calls:2026-10:multiDepartureBoard')).toBeUndefined()
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('asks journeyDetail for a reference, counted under its service', () => {
    const stop = { name: 'Nørreport St.', extId: '8603307', lon: 12.57, lat: 55.68 }
    const { layer, urls } = answering([
      (request) => Effect.succeed(Http.json(request, 200, { Stops: { Stop: [stop] } })),
    ])
    return Effect.gen(function* () {
      const { answer } = yield* (yield* Rejseplanen).journeyDetail({ ref: '2|#ZI#1#' })
      expect(answer.Stops.Stop).toEqual([stop])
      const url = new URL(urls[0])
      expect(url.pathname).toBe('/api/journeyDetail')
      expect(url.searchParams.get('id')).toBe('2|#ZI#1#')
      expect(yield* (yield* Store).get('test:calls:2026-10:journeyDetail')).toBe(1)
      expect(yield* callCount).toBe(1)
    }).pipe(Effect.provide(layer))
  })

  it.effect('tries a 503 once more and counts both calls', () => {
    const { layer } = answering([status(503), ok])
    return Effect.gen(function* () {
      const { attempts } = yield* (yield* Rejseplanen).journeyPos(query)
      expect(attempts).toBe(2)
      expect(yield* callCount).toBe(2)
    }).pipe(Effect.provide(layer))
  })

  it.effect('gives up after a second 503', () => {
    const { layer } = answering([status(503)])
    return Effect.gen(function* () {
      const error = yield* failure((yield* Rejseplanen).journeyPos(query))
      expect(error).toMatchObject({ kind: 'status', status: 503, service: 'journeyPos' })
      expect(yield* callCount).toBe(2)
    }).pipe(Effect.provide(layer))
  })

  it.effect('never retries a 4xx, and reads a refused key and a spent month', () => {
    const { layer } = answering([
      (request) => Effect.succeed(errorAnswer(request, 401, 'API_AUTH', 'bad key')),
      (request) => Effect.succeed(errorAnswer(request, 403, 'API_QUOTA', 'spent')),
      status(400),
    ])
    return Effect.gen(function* () {
      const rejseplanen = yield* Rejseplanen
      expect(yield* failure(rejseplanen.journeyPos(query))).toMatchObject({ kind: 'refused' })
      expect(yield* failure(rejseplanen.journeyPos(query))).toMatchObject({ kind: 'quota' })
      expect(yield* failure(rejseplanen.journeyPos(query))).toMatchObject({
        kind: 'status',
        status: 400,
      })
      expect(yield* callCount).toBe(3)
    }).pipe(Effect.provide(layer))
  })

  it.effect('counts an answer the schema rejects as a body error, without the key', () => {
    const { layer } = answering([
      (request) =>
        Effect.succeed(Http.json(request, 200, { Journey: [{ lat: 'north', key: KEY }] })),
    ])
    return Effect.gen(function* () {
      const error = yield* failure((yield* Rejseplanen).journeyPos(query))
      expect(error.kind).toBe('body')
      expect(error.message).not.toContain(KEY)
    }).pipe(Effect.provide(layer))
  })

  it.effect('times out a call after 8 s, still counted, and doesn’t try again', () => {
    const { layer } = answering([() => Effect.never])
    return Effect.gen(function* () {
      const fiber = yield* Effect.forkChild((yield* Rejseplanen).journeyPos(query))
      yield* TestClock.adjust('8 seconds')
      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* failure(Fiber.join(fiber))).toMatchObject({ kind: 'timeout' })
      expect(yield* callCount).toBe(1)
    }).pipe(Effect.provide(layer))
  })
})
