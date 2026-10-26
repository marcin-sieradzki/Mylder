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

  it.effect('takes a journey’s latest correction, and keeps a day’s for two days', () =>
    Effect.gen(function* () {
      const corrections = correctionsIn(yield* memoryStore(), key)
      yield* corrections.keep('2026-06-16', '300@160626', 'bus.5C.a.20260616.0707')
      yield* corrections.keep('2026-06-16', '300@160626', 'bus.5C.b.20260616.0717')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '300@160626': 'bus.5C.b.20260616.0717',
      })
      yield* TestClock.adjust('47 hours')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '300@160626': 'bus.5C.b.20260616.0717',
      })
      yield* TestClock.adjust('1 hour')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({})
    }),
  )

  it.effect('keeps a correction the store failed to keep once, when it is made again', () =>
    Effect.gen(function* () {
      const memory = yield* memoryStore()
      let failures = 1
      const failingOnce: StoreShape = {
        ...memory,
        set: (k, value, seconds) =>
          failures-- > 0 ? Effect.die(new Error('store down')) : memory.set(k, value, seconds),
      }
      const corrections = correctionsIn(failingOnce, key)
      const keep = corrections.keep('2026-06-16', '400@160626', 'bus.5C.a.20260616.0707')
      yield* Effect.exit(keep)
      yield* keep
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '400@160626': 'bus.5C.a.20260616.0707',
      })
    }),
  )

  it.effect('keeps at most 100 corrections a day', () =>
    Effect.gen(function* () {
      const corrections = correctionsIn(yield* memoryStore(), key)
      for (let n = 1; n <= 101; n++) {
        yield* corrections.keep('2026-06-16', `${n}@160626`, `bus.5C.${n}.20260616.0707`)
      }
      const read = yield* corrections.read(['2026-06-16'])
      expect(Object.keys(read)).toHaveLength(100)
      expect(read['100@160626']).toBe('bus.5C.100.20260616.0707')
      expect(read['101@160626']).toBeUndefined()
    }),
  )

  it.effect('keeps a trip opened again and again once, leaving room for the day’s others', () =>
    Effect.gen(function* () {
      const corrections = correctionsIn(yield* memoryStore(), key)
      for (let n = 1; n <= 150; n++) {
        yield* corrections.keep('2026-06-16', '500@160626', 'bus.5C.a.20260616.0707')
      }
      yield* corrections.keep('2026-06-16', '600@160626', 'bus.5C.b.20260616.0717')
      expect(yield* corrections.read(['2026-06-16'])).toEqual({
        '500@160626': 'bus.5C.a.20260616.0707',
        '600@160626': 'bus.5C.b.20260616.0717',
      })
    }),
  )
})
