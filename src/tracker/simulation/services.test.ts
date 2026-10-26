import { describe, expect, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import {
  DepartureBoardAnswer,
  HimSearchAnswer,
  JourneyDetailAnswer,
  JourneyPosAnswer,
} from '../rejseplanen/answers'
import { fixtureTimetable } from '../testing'
import * as SimulatedRejseplanen from './layer'
import { call, CITY, MOMENT } from './testing'

const timetable = await fixtureTimetable()
const simulation = SimulatedRejseplanen.layer({ timetable })

const decoded = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  Effect.map(({ body }: { body: string }) => Schema.decodeUnknownSync(schema)(JSON.parse(body)))

const board = (idList: string, moment = MOMENT) =>
  call('multiDepartureBoard', { idList, duration: 30 }, moment).pipe(decoded(DepartureBoardAnswer))

const detail = (id: string, moment = MOMENT) =>
  call('journeyDetail', { id }, moment).pipe(decoded(JourneyDetailAnswer))

const messages = (moment = MOMENT) => call('himsearch', {}, moment).pipe(decoded(HimSearchAnswer))

describe('the simulated multiDepartureBoard', () => {
  it.effect("lists a stop's departures over the window, in order, decoding with the schema", () =>
    Effect.gen(function* () {
      const { Departure = [] } = yield* board('8600626')
      expect(Departure.length).toBeGreaterThan(0)
      expect(Departure.every((d) => d.stop === 'København H')).toBe(true)
      const times = Departure.map((d) => `${d.rtDate ?? d.date} ${d.rtTime ?? d.time}`)
      expect(times).toEqual([...times].sort())
    }).pipe(Effect.provide(simulation)),
  )

  it.effect('gives the Metro no prognosis and S-tog a prognosis and a track', () =>
    Effect.gen(function* () {
      // 07:05, while the fixture's M1 trips still run.
      const metro = (yield* board('8603308', Date.UTC(2026, 5, 16, 5, 5))).Departure ?? []
      expect(metro.length).toBeGreaterThan(0)
      expect(metro.every((d) => d.ProductAtStop?.cls === '1024')).toBe(true)
      for (const d of metro) {
        expect(d.prognosisType).toBeUndefined()
        expect(d.rtTime).toBeUndefined()
      }
      const stog = ((yield* board('8600626')).Departure ?? []).filter(
        (d) => d.ProductAtStop?.cls === '16' && !d.cancelled,
      )
      expect(stog.length).toBeGreaterThan(0)
      for (const d of stog) {
        expect(['PROGNOSED', 'CALCULATED']).toContain(d.prognosisType)
        expect(d.reachable).toBe(true)
      }
      expect(stog.every((d) => d.rtTrack !== undefined)).toBe(true)
    }).pipe(Effect.provide(simulation)),
  )

  it.effect('gives each departure its trip’s own messages, for its product', () =>
    Effect.gen(function* () {
      const departures = (yield* board('8600626')).Departure ?? []
      const stog = departures.filter((d) => d.ProductAtStop?.cls === '16')
      expect(stog.length).toBeGreaterThan(0)
      for (const d of stog) {
        expect(d.Messages?.Message.map((m) => m.head)).toEqual([
          'Færre S-tog mellem København H og Hellerup',
        ])
      }
      const buses = (yield* board('27532')).Departure ?? []
      const bus = buses.filter((d) => d.ProductAtStop?.cls === '32')
      expect(bus.length).toBeGreaterThan(0)
      // The 5C's diversion at Langebro, and never the S-tog's fault.
      const heads = new Set(bus.flatMap((d) => d.Messages?.Message.map((m) => m.head) ?? []))
      expect([...heads]).toEqual(['Linje 5C kører en anden rute ved Langebro'])
    }).pipe(Effect.provide(simulation)),
  )
})

describe('one trip in every service', () => {
  it.effect(
    'has the same expected time at a stop in journeyPos, the departure board and its detail',
    () =>
      Effect.gen(function* () {
        const journeys =
          (yield* call('journeyPos', CITY).pipe(decoded(JourneyPosAnswer))).Journey ?? []
        // A journey with a stop ahead, inside the board's window, that it is late for.
        const late = journeys.flatMap((journey) =>
          (journey.Stops?.Stop ?? [])
            .filter((stop) => stop.rtDepTime !== undefined && stop.rtDepTime > '07:21:00')
            .map((stop) => ({ journey, stop })),
        )
        expect(late.length).toBeGreaterThan(0)
        for (const { journey, stop } of late.slice(0, 5)) {
          const ref = journey.JourneyDetailRef.ref
          const row = ((yield* board(stop.extId)).Departure ?? []).find(
            (d) => d.JourneyDetailRef.ref === ref && d.time === stop.depTime,
          )
          expect(row?.rtTime).toBe(stop.rtDepTime)
          const own = (yield* detail(ref)).Stops.Stop.find((s) => s.routeIdx === stop.routeIdx)
          expect(own?.rtDepTime).toBe(stop.rtDepTime)
        }
      }).pipe(Effect.provide(simulation)),
  )
})

describe('the simulated journeyDetail', () => {
  it.effect(
    'gives every call, the last position and the trip’s own messages with their range',
    () =>
      Effect.gen(function* () {
        // An S-tog on its way to København H, which the weekday's signal-fault message names.
        const stog = ((yield* board('8600626')).Departure ?? []).find(
          (d) => d.ProductAtStop?.cls === '16' && !d.cancelled,
        )
        expect(stog).toBeDefined()
        const answer = yield* detail(stog!.JourneyDetailRef.ref)
        expect(answer.Stops.Stop.length).toBeGreaterThan(4)
        expect(answer.lastPos).toBeDefined()
        const message = answer.Messages?.Message.find((m) => m.id === 'simulated-2')
        const kobenhavnH = answer.Stops.Stop.find((stop) => stop.extId === '8600626')!
        expect(message?.routeIdxFrom).toBeLessThanOrEqual(kobenhavnH.routeIdx!)
        expect(message?.routeIdxTo).toBeGreaterThanOrEqual(kobenhavnH.routeIdx!)
      }).pipe(Effect.provide(simulation)),
  )

  it.effect('refuses a reference it does not know', () =>
    Effect.gen(function* () {
      const { status, body } = yield* call('journeyDetail', { id: '2|#ZI#1#DA#160626#' })
      expect(status).toBe(400)
      expect(JSON.parse(body)).toMatchObject({ errorCode: 'SVC_PARAM' })
    }).pipe(Effect.provide(simulation)),
  )
})

describe('the simulated himsearch', () => {
  it.effect("returns the scenario's active and later messages by the clock", () =>
    Effect.gen(function* () {
      const active = (answer: typeof HimSearchAnswer.Type) =>
        Object.fromEntries((answer.Message ?? []).map((m) => [m.id, m.act]))
      // 04:30 in Copenhagen: the 5C diversion has begun, the signal fault not yet.
      expect(active(yield* messages(Date.UTC(2026, 5, 16, 2, 30)))).toEqual({
        'simulated-1': true,
        'simulated-2': false,
        'simulated-3': false,
      })
      // 07:20: both are on; the weekend's works are still to come.
      expect(active(yield* messages())).toEqual({
        'simulated-1': true,
        'simulated-2': true,
        'simulated-3': false,
      })
      // 03:30 on Wednesday: the diversion still runs overnight; the signal fault is over.
      expect(active(yield* messages(Date.UTC(2026, 5, 17, 1, 30)))).toEqual({
        'simulated-1': true,
        'simulated-2': false,
        'simulated-3': false,
      })
      // Saturday noon: the weekend's works are on, and the diversion has ended for the week.
      expect(active(yield* messages(Date.UTC(2026, 5, 20, 10)))).toEqual({
        'simulated-2': true,
        'simulated-3': true,
      })
    }).pipe(Effect.provide(simulation)),
  )

  it.effect('names every platform of the stops it affects, in Danish', () =>
    Effect.gen(function* () {
      const [diversion] = (yield* messages()).Message ?? []
      expect(diversion.head).toBe('Linje 5C kører en anden rute ved Langebro')
      // Both sides of the street at Klaksvigsgade.
      expect(diversion.affectedStops?.StopLocation.map((s) => s.extId)).toEqual(['807', '25109'])
      // Since Monday morning, the week's start.
      expect(diversion).toMatchObject({ sDate: '2026-06-15', sTime: '04:00:00', products: 32 })
    }).pipe(Effect.provide(simulation)),
  )
})
