// The tracker's state store (ADR 0008, docs/live-data.md "What the store is"): four operations,
// in memory locally and in tests, a free hosted Redis in production. Both adapters keep the same
// contract, which `store.test.ts` holds them to. Values are JSON; expiries run on the Effect
// clock, so a test moves them with `TestClock`.
import 'server-only'
import { Clock, Context, Effect, Layer } from 'effect'

export interface StoreShape {
  /** The value at a key, or undefined when there is none or it has expired. */
  readonly get: (key: string) => Effect.Effect<unknown>
  /** Sets a key's value, kept for `seconds` when given, else for good. */
  readonly set: (key: string, value: unknown, seconds?: number) => Effect.Effect<void>
  /** Sets a key's value only when it has none; true when this call set it. The lease. */
  readonly setIfAbsent: (key: string, value: unknown, seconds: number) => Effect.Effect<boolean>
  /** Adds one to a key's count, kept for `seconds` when given, and returns the new count. */
  readonly increment: (key: string, seconds?: number) => Effect.Effect<number>
}

export class Store extends Context.Service<Store, StoreShape>()('mylder/tracker/Store') {}

/** The store in memory, for one instance: local runs, tests, and production without Redis. */
export function memoryStore(): Effect.Effect<StoreShape> {
  return Effect.sync(() => {
    const entries = new Map<string, { value: unknown; until: number }>()
    const live = (key: string, now: number) => {
      const entry = entries.get(key)
      if (entry && entry.until <= now) entries.delete(key)
      return entry && entry.until > now ? entry : undefined
    }
    const until = (now: number, seconds?: number) =>
      seconds === undefined ? Infinity : now + seconds * 1000
    return {
      get: (key) => Clock.currentTimeMillis.pipe(Effect.map((now) => live(key, now)?.value)),
      set: (key, value, seconds) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((now) => void entries.set(key, { value, until: until(now, seconds) })),
        ),
      setIfAbsent: (key, value, seconds) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((now) => {
            if (live(key, now)) return false
            entries.set(key, { value, until: until(now, seconds) })
            return true
          }),
        ),
      increment: (key, seconds) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((now) => {
            const entry = live(key, now)
            const count = (typeof entry?.value === 'number' ? entry.value : 0) + 1
            entries.set(key, { value: count, until: entry?.until ?? until(now, seconds) })
            return count
          }),
        ),
    }
  })
}

/** A fresh in-memory store as the tracker's `Store`. */
export const memoryLayer: Layer.Layer<Store> = Layer.effect(Store, memoryStore())
