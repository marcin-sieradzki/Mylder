// The aircraft source (docs/aircraft.md, "One call every 10 s"): whoever asks, at most one call
// to the feed every 10 s within an instance, the requests that come meanwhile sharing it. An
// answer becomes the snapshot of the aircraft it keeps; a failed call gives the last aircraft,
// aged by the clock, with the health that says why. No store, lease or budget (ADR 0014): each
// aircraft carries its own position's age, and the feed needs no key.
import 'server-only'
import { Cause, Clock, Context, Effect, Layer, Result, Schema, Semaphore } from 'effect'
import * as Http from '../http.ts'
import { ReadsbAnswer } from './answers.ts'
import { aged, aircraftIn } from './build.ts'
import type { AircraftHealth, AircraftProvider, AircraftSnapshot } from './snapshot.ts'

/** How often the feed is asked, in seconds, and so how long a snapshot holds. */
export const POLL_SECONDS = 10

/** How long a call may take before it counts as a timeout. A failed call is not tried again. */
export const CALL_TIMEOUT = '4 seconds'

/** How a call failed, as the snapshot's health names it. */
export interface FeedError {
  readonly kind: NonNullable<AircraftHealth['kind']>
  readonly message: string
}

export interface AircraftSettings {
  /** The provider the snapshot names. */
  readonly provider: AircraftProvider
  /** The circle query's URL. */
  readonly url: string
}

export class AircraftConfig extends Context.Service<AircraftConfig, AircraftSettings>()(
  'mylder/tracker/aircraft/AircraftConfig',
) {}

export interface AircraftShape {
  /** The snapshot: the latest while it holds, else a new call's; none when the layer is off. */
  readonly getSnapshot: Effect.Effect<AircraftSnapshot | undefined>
  /** The source's own clock, which a recording sets, for the route's cache headers. */
  readonly now: Effect.Effect<number>
}

export class Aircraft extends Context.Service<Aircraft, AircraftShape>()(
  'mylder/tracker/aircraft/Aircraft',
) {}

const decode = Schema.decodeUnknownEffect(ReadsbAnswer)

/** One call to the feed, decoded, or how it failed. */
const ask = (client: Http.HttpClient.HttpClient, url: string) =>
  Effect.gen(function* () {
    const fail = (kind: FeedError['kind'], message: string) =>
      Effect.fail<FeedError>({ kind, message })
    const { status, text } = yield* Http.getText(client, url, {}).pipe(
      Effect.timeout(CALL_TIMEOUT),
      Effect.catch((error) =>
        Cause.isTimeoutError(error)
          ? fail('timeout', `the feed took over ${CALL_TIMEOUT}`)
          : fail(error.network ? 'network' : 'status', error.message),
      ),
    )
    if (status >= 400) return yield* fail('status', `the feed answered ${status}`)
    const body = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => ({ kind: 'body', message: "the feed's answer isn't JSON" }) as FeedError,
    })
    return yield* decode(body).pipe(
      Effect.catch((error) => fail('body', `the feed's answer didn't decode: ${String(error)}`)),
    )
  })

/** The aircraft source on the feed `AircraftConfig` names, through the `HttpClient` given. */
export const layer: Layer.Layer<Aircraft, never, Http.HttpClient.HttpClient | AircraftConfig> =
  Layer.effect(
    Aircraft,
    Effect.gen(function* () {
      const client = yield* Http.HttpClient.HttpClient
      const { provider, url } = yield* AircraftConfig
      // One call at a time: a request that waits finds the snapshot the call before it made.
      const one = yield* Semaphore.make(1)
      let latest: AircraftSnapshot | undefined

      const call = Effect.gen(function* () {
        const result = yield* Effect.result(ask(client, url))
        const now = yield* Clock.currentTimeMillis
        const due = { fetched: now, nextDue: now + POLL_SECONDS * 1000, pollInterval: POLL_SECONDS }
        if (Result.isSuccess(result)) {
          return {
            ...due,
            provider,
            health: {
              status: 'ok',
              since: latest?.health.status === 'ok' ? latest.health.since : now,
            },
            lastAnswer: now,
            aircraft: aircraftIn(result.success),
          } satisfies AircraftSnapshot
        }
        const { kind, message } = result.failure
        yield* Effect.logWarning(`Aircraft feed: ${message}`)
        // The feed has failed since its first failure in a row, whatever each one's kind.
        const before = latest?.health
        const since = before?.status === 'error' ? before.since : now
        return {
          ...due,
          provider,
          health: { status: 'error', kind, since },
          ...(latest?.lastAnswer === undefined ? {} : { lastAnswer: latest.lastAnswer }),
          aircraft: latest ? aged(latest.aircraft, (now - latest.fetched) / 1000) : [],
        } satisfies AircraftSnapshot
      })

      const getSnapshot = one.withPermits(1)(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          if (latest && now < latest.nextDue) return latest
          latest = yield* call
          return latest
        }),
      )

      return { getSnapshot, now: Clock.currentTimeMillis }
    }),
  )

/** The source when `MYLDER_AIRCRAFT_SOURCE` is off: no snapshot, so the route answers 404. */
export const offLayer: Layer.Layer<Aircraft> = Layer.succeed(Aircraft, {
  getSnapshot: Effect.succeed(undefined),
  now: Clock.currentTimeMillis,
})
