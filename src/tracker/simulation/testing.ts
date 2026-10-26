// Calls the simulated Rejseplanen the way the tracker's client will, for the simulation's tests.
import 'server-only'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { HttpClient } from '../http.ts'

/** 07:20 in Copenhagen on Tuesday 2026-06-16, when the fixture has seventeen trips underway. */
export const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)

/** The position poll's query, over the whole box and every product the tracker asks for. */
export const CITY = {
  llLat: 55.45,
  llLon: 12.05,
  urLat: 56.05,
  urLon: 12.7,
  products: 3839,
  positionMode: 'CALC_REPORT',
} as const

type Query = Readonly<Record<string, string | number>>

/** Calls a service at a moment through whatever `HttpClient` is provided. */
export const call = (service: string, urlParams: Query, moment = MOMENT) =>
  TestClock.setTime(moment).pipe(Effect.andThen(request(service, urlParams)))

/** Calls a service at the test clock's moment. */
export const request = (service: string, urlParams: Query) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(`https://www.rejseplan.dk/api/${service}`, {
      urlParams: { format: 'json', ...urlParams },
    })
    return { status: response.status, body: yield* response.text }
  })
