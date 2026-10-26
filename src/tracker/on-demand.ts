// The on-demand calls (docs/live-data.md, "The budget"): a call a viewer's opened stop or trip
// makes, `multiDepartureBoard` or `journeyDetail`, apart from the run. Each answer is kept in the
// store for a minute under what it was asked for, so every viewer in that minute shares it; a
// new call is made only while the budget allows on-demand calls and the shared limit, ten a
// minute across all viewers, has room. Whatever stops a call, the caller answers from the
// timetable.
import 'server-only'
import { Clock, Effect, Result } from 'effect'
import type { Pacing } from './budget.ts'
import { MIN_CDN_SECONDS } from './caching.ts'
import {
  CALL_ATTEMPTS,
  CALL_TIMEOUT_SECONDS,
  type Answered,
  type CallError,
} from './rejseplanen/client.ts'
import type { StoreShape } from './store.ts'

/** The most on-demand calls in one minute, across all viewers. */
export const ON_DEMAND_PER_MINUTE = 10

/** How long an on-demand answer is kept and shared. */
export const ON_DEMAND_SECONDS = 60

/**
 * How long one request holds a name's call while it is under way, so a second viewer asking at
 * once answers from the timetable rather than making the same call: past the call's slowest,
 * every attempt timing out, with a few seconds to spare.
 */
const LEASE_SECONDS = CALL_ATTEMPTS * CALL_TIMEOUT_SECONDS + 4

/** An on-demand call's answer, and the moment it was asked for. */
export interface Called<A> {
  readonly answer: A
  readonly at: number
}

/**
 * What an ask gives: the call's answer, kept or new, when there is one. Without one for a passing
 * reason (another request's call for the same name under way, or the minute's limit full), when
 * asking again may find one, so the answer given meanwhile isn't kept past it.
 */
export interface Asked<A> {
  readonly called?: Called<A>
  readonly askAgain?: number
}

export interface OnDemandSettings {
  readonly store: StoreShape
  /** A store key under the tracker's prefix. */
  readonly key: (name: string) => string
  /** The budget's pacing at a moment, which says whether on-demand calls are allowed. */
  readonly pace: (now: number) => Effect.Effect<Pacing>
  /** What a failed call leaves behind: its log line, and a quota error's spent month. */
  readonly failed: (error: CallError, pace: Pacing) => Effect.Effect<unknown>
}

/**
 * Asks for something on demand, by a name that keys its cache (`stop:<id>`, `trip:<key>`): the
 * kept answer while it is fresh, else a new call's when the budget and the limit allow one, else
 * none. While another request's call for the same name is under way, asking again a few seconds
 * on may find its answer; while the limit is full, the next minute may make the call. A call is
 * counted against the limit before it is sent; one that fails is not kept, so a viewer may ask
 * again once its lease runs out.
 */
export type OnDemand = <A>(
  name: string,
  call: Effect.Effect<Answered<A>, CallError>,
) => Effect.Effect<Asked<A>>

export function onDemand({ store, key, pace, failed }: OnDemandSettings): OnDemand {
  return <A>(name: string, call: Effect.Effect<Answered<A>, CallError>) =>
    Effect.gen(function* () {
      const cache = key(`on-demand:${name}`)
      // The in-memory store keeps the answer as it was put; the Redis adapter (#56) decodes it.
      const kept = (yield* store.get(cache)) as Called<A> | undefined
      if (kept) return { called: kept }
      const now = yield* Clock.currentTimeMillis
      const pacing = yield* pace(now)
      if (!pacing.onDemand) return {}
      if (!(yield* store.setIfAbsent(key(`on-demand:lease:${name}`), now, LEASE_SECONDS))) {
        return { askAgain: now + MIN_CDN_SECONDS * 1000 }
      }
      const minute = Math.floor(now / 60_000)
      // Kept past its minute, so a request on the boundary still finds its count.
      const used = yield* store.increment(key(`on-demand:minute:${minute}`), 2 * ON_DEMAND_SECONDS)
      if (used > ON_DEMAND_PER_MINUTE) return { askAgain: (minute + 1) * 60_000 }
      const result = yield* Effect.result(call)
      if (Result.isFailure(result)) {
        yield* failed(result.failure, pacing)
        return {}
      }
      const called: Called<A> = { answer: result.success.answer, at: now }
      yield* store.set(cache, called, ON_DEMAND_SECONDS)
      return { called }
    })
}

/** An answer given without a call, due again by when asking again may find one, if sooner. */
export const dueBy = <T extends { readonly nextDue: number }>(answer: T, askAgain?: number): T =>
  askAgain === undefined || askAgain >= answer.nextDue ? answer : { ...answer, nextDue: askAgain }
