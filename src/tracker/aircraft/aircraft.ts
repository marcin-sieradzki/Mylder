// The aircraft source (docs/aircraft.md, "One call every 10 s"): whoever asks, at most one call
// to the feed every 10 s within an instance, the requests that come meanwhile sharing it. A call
// adsb.lol fails goes to adsb.fi, and after a 429 adsb.lol rests while adsb.fi answers ("Limits").
// An answer becomes the snapshot of the aircraft it keeps, naming who gave it; a call both fail
// gives the last aircraft, aged by the clock, with the health that says why. Each aircraft's data
// state is decided at the snapshot's fetch. No store, lease or budget (ADR 0014): each
// aircraft carries its own position's age, and the feed needs no key.
import 'server-only'
import { Cause, Clock, Context, Effect, Layer, Result, Schema, Semaphore } from 'effect'
import * as Http from '../http.ts'
import { ReadsbAnswer } from './answers.ts'
import { aged, aircraftIn, withStates } from './build.ts'
import type { AircraftHealth, AircraftSnapshot } from './snapshot.ts'
import type { Feed } from './source.ts'

/** How often the feed is asked, in seconds, and so how long a snapshot holds. */
export const POLL_SECONDS = 10

/** How long a call may take before it counts as a timeout. A failed call is not tried again. */
export const CALL_TIMEOUT = '4 seconds'

/** How a call failed, as the snapshot's health names it. */
export interface FeedError {
  readonly kind: NonNullable<AircraftHealth['kind']>
  readonly message: string
  /** For a 429, too many calls: its `Retry-After` header, if it sent one. */
  readonly limited?: { readonly retryAfter: string | undefined }
}

/**
 * When a feed that answered 429 at `now` may be asked again: once its `Retry-After`, in seconds
 * or as a date, has passed, or else at the next midnight UTC, when adsb.lol's daily allowance of
 * calls from an address starts again (docs/aircraft.md, "Limits").
 */
function restsUntil(now: number, retryAfter: string | undefined): number {
  const value = retryAfter?.trim() ?? ''
  if (/^\d+$/.test(value)) return now + Number(value) * 1000
  const date = Date.parse(value)
  if (!Number.isNaN(date)) return date
  const today = new Date(now)
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)
}

export interface AircraftSettings {
  /** The feed asked first. */
  readonly feed: Feed
  /** The feed that answers a call the first one fails, and every call while it rests. */
  readonly fallback: Feed
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
    const { status, headers, text } = yield* Http.getText(client, url, {}).pipe(
      Effect.timeout(CALL_TIMEOUT),
      Effect.catch((error) =>
        Cause.isTimeoutError(error)
          ? fail('timeout', `the feed took over ${CALL_TIMEOUT}`)
          : fail(error.network ? 'network' : 'status', error.message),
      ),
    )
    if (status === 429) {
      return yield* Effect.fail<FeedError>({
        kind: 'status',
        message: 'the feed answered 429, too many calls',
        limited: { retryAfter: headers['retry-after'] },
      })
    }
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
      const { feed, fallback } = yield* AircraftConfig
      // One call at a time: a request that waits finds the snapshot the call before it made.
      const one = yield* Semaphore.make(1)
      let latest: AircraftSnapshot | undefined

      // After a 429 the feed rests until then, and its fallback answers every call meanwhile.
      let restingUntil = 0

      /** A feed's answer, with who gave it; a failure is logged with who failed. */
      const answered = (from: Feed) =>
        ask(client, from.url).pipe(
          Effect.tapError(({ message }) =>
            Effect.logWarning(`Aircraft feed ${from.provider}: ${message}`),
          ),
          Effect.map((answer) => ({ answer, provider: from.provider })),
        )

      /** The feed's answer, or its fallback's for a call it fails or while it rests. */
      const either = Effect.gen(function* () {
        if ((yield* Clock.currentTimeMillis) < restingUntil) return yield* answered(fallback)
        const first = yield* Effect.result(answered(feed))
        if (Result.isSuccess(first)) return first.success
        const { limited } = first.failure
        if (limited) {
          restingUntil = restsUntil(yield* Clock.currentTimeMillis, limited.retryAfter)
          yield* Effect.logWarning(
            `Aircraft feed ${feed.provider} rests until ${new Date(restingUntil).toISOString()}`,
          )
        }
        return yield* answered(fallback)
      })

      const call = Effect.gen(function* () {
        const result = yield* Effect.result(either)
        const now = yield* Clock.currentTimeMillis
        const due = { fetched: now, nextDue: now + POLL_SECONDS * 1000, pollInterval: POLL_SECONDS }
        const decided = (health: AircraftHealth) => ({
          now,
          fetched: now,
          pollInterval: POLL_SECONDS,
          health,
        })
        if (Result.isSuccess(result)) {
          const health: AircraftHealth = {
            status: 'ok',
            since: latest?.health.status === 'ok' ? latest.health.since : now,
          }
          return {
            ...due,
            provider: result.success.provider,
            health,
            lastAnswer: now,
            aircraft: withStates(aircraftIn(result.success.answer), decided(health)),
          } satisfies AircraftSnapshot
        }
        const { kind } = result.failure
        // The feed has failed since its first failure in a row, whatever each one's kind.
        const before = latest?.health
        const since = before?.status === 'error' ? before.since : now
        const health: AircraftHealth = { status: 'error', kind, since }
        const kept = latest ? aged(latest.aircraft, (now - latest.fetched) / 1000) : []
        return {
          ...due,
          // The aircraft kept are the last answer's, so the snapshot names who gave them, and
          // nobody before any feed has answered.
          ...(latest?.provider === undefined ? {} : { provider: latest.provider }),
          health,
          ...(latest?.lastAnswer === undefined ? {} : { lastAnswer: latest.lastAnswer }),
          aircraft: withStates(kept, decided(health)),
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
