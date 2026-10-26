// The on-demand calls (docs/live-data.md, "The budget"): a call a viewer's opened stop or trip
// makes, `multiDepartureBoard` or `journeyDetail`, apart from the run. Each answer is kept in the
// store for a minute under what it was asked for, so every viewer in that minute shares it; a
// new call is made only while the budget allows on-demand calls and the shared limit, ten a
// minute across all viewers, has room. Whatever stops a call, the caller answers from the
// timetable.
import 'server-only'
import { Clock, Effect, Result } from 'effect'
import type { Pacing } from './budget.ts'
import type { Answered, CallError } from './rejseplanen/client.ts'
import type { StoreShape } from './store.ts'

/** The most on-demand calls in one minute, across all viewers. */
export const ON_DEMAND_PER_MINUTE = 10

/** How long an on-demand answer is kept and shared. */
export const ON_DEMAND_SECONDS = 60

/**
 * How long one request holds a name's call while it is under way, so a second viewer asking at
 * once answers from the timetable rather than making the same call.
 */
const LEASE_SECONDS = 15

/** An on-demand call's answer, and the moment it was asked for. */
export interface Called<A> {
  readonly answer: A
  readonly at: number
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
 * undefined, as it is while another request's call for the same name is under way. A call is
 * counted against the limit before it is sent; one that fails is not kept, so a viewer may ask
 * again once its lease runs out.
 */
export type OnDemand = <A>(
  name: string,
  call: Effect.Effect<Answered<A>, CallError>,
) => Effect.Effect<Called<A> | undefined>

export function onDemand({ store, key, pace, failed }: OnDemandSettings): OnDemand {
  return <A>(name: string, call: Effect.Effect<Answered<A>, CallError>) =>
    Effect.gen(function* () {
      const cache = key(`on-demand:${name}`)
      // The in-memory store keeps the answer as it was put; the Redis adapter (#56) decodes it.
      const kept = (yield* store.get(cache)) as Called<A> | undefined
      if (kept) return kept
      const now = yield* Clock.currentTimeMillis
      const pacing = yield* pace(now)
      if (!pacing.onDemand) return undefined
      if (!(yield* store.setIfAbsent(key(`on-demand:lease:${name}`), now, LEASE_SECONDS))) {
        return undefined
      }
      const minute = Math.floor(now / 60_000)
      // Kept past its minute, so a request on the boundary still finds its count.
      const used = yield* store.increment(key(`on-demand:minute:${minute}`), 2 * ON_DEMAND_SECONDS)
      if (used > ON_DEMAND_PER_MINUTE) return undefined
      const result = yield* Effect.result(call)
      if (Result.isFailure(result)) {
        yield* failed(result.failure, pacing)
        return undefined
      }
      const called: Called<A> = { answer: result.success.answer, at: now }
      yield* store.set(cache, called, ON_DEMAND_SECONDS)
      return called
    })
}
