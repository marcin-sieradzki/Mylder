import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { correctionsIn } from './corrections'
import { memoryStore, type StoreShape } from './store'

// The join's corrections in the store (docs/live-data.md, "What the store keeps"): each one a
// trip's detail makes is kept for its service day, whoever else corrects a journey at once, and
// every join reads the days it joins.

const key = (name: string) => `mylder:test:${name}`

/** The store in memory, each operation answering after a pause, as a store over the network does. */
const pausing = Effect.map(memoryStore(), (store): StoreShape => ({
  get: (k) => Effect.andThen(Effect.yieldNow, store.get(k)),
  set: (k, value, seconds) => Effect.andThen(Effect.yieldNow, store.set(k, value, seconds)),
  setIfAbsent: (k, value, seconds) =>
    Effect.andThen(Effect.yieldNow, store.setIfAbsent(k, value, seconds)),
  increment: (k, seconds) => Effect.andThen(Effect.yieldNow, store.increment(k, seconds)),
}))

describe('the join’s corrections', () => {
  it.effect('keeps two corrections made at once, each of its journey', () =>
    Effect.gen(function* () {
      const corrections = correctionsIn(yield* pausing, key)
      yield* Effect.all(
        [
          corrections.keep('2026-06-16', '473610@160626', 'bus.5C.a.20260616.0707'),
          corrections.keep('2026-06-16', '816239@160626', 'bus.5C.b.20260616.0717'),
        ],
        { concurrency: 'unbounded' },
      )
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '473610@160626': 'bus.5C.a.20260616.0707',
        '816239@160626': 'bus.5C.b.20260616.0717',
      })
    }),
  )

  it.effect('reads the corrections of the service days asked for', () =>
    Effect.gen(function* () {
      const corrections = correctionsIn(yield* pausing, key)
      yield* corrections.keep('2026-06-15', '100@150626', 'bus.5C.a.20260615.2350')
      yield* corrections.keep('2026-06-16', '200@160626', 'bus.5C.b.20260616.0010')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '200@160626': 'bus.5C.b.20260616.0010',
      })
      expect(yield* corrections.read(['2026-06-15', '2026-06-16'])).toEqual({
        '100@150626': 'bus.5C.a.20260615.2350',
        '200@160626': 'bus.5C.b.20260616.0010',
      })
    }),
  )

  it.effect('keeps a journey’s first correction, and a day’s for two days', () =>
    Effect.gen(function* () {
      const corrections = correctionsIn(yield* memoryStore(), key)
      yield* corrections.keep('2026-06-16', '300@160626', 'bus.5C.a.20260616.0707')
      yield* corrections.keep('2026-06-16', '300@160626', 'bus.5C.b.20260616.0717')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '300@160626': 'bus.5C.a.20260616.0707',
      })
      yield* TestClock.adjust('47 hours')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '300@160626': 'bus.5C.a.20260616.0707',
      })
      yield* TestClock.adjust('1 hour')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({})
    }),
  )
})
