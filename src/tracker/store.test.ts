import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { memoryStore, type StoreShape } from './store'

/**
 * The four operations' contract. Every adapter runs it; the Redis one joins with Upstash (#56),
 * with the in-memory store standing in until then.
 */
function contract(name: string, make: () => Effect.Effect<StoreShape>) {
  describe(`${name} store`, () => {
    it.effect('keeps a value until its expiry, then forgets it', () =>
      Effect.gen(function* () {
        const store = yield* make()
        yield* store.set('snapshot', { trips: 3 }, 60)
        expect(yield* store.get('snapshot')).toEqual({ trips: 3 })
        yield* TestClock.adjust('59 seconds')
        expect(yield* store.get('snapshot')).toEqual({ trips: 3 })
        yield* TestClock.adjust('1 second')
        expect(yield* store.get('snapshot')).toBeUndefined()
        expect(yield* store.get('never set')).toBeUndefined()
      }),
    )

    it.effect('keeps a value with no expiry for good', () =>
      Effect.gen(function* () {
        const store = yield* make()
        yield* store.set('history', [1, 2])
        yield* TestClock.adjust('400 days')
        expect(yield* store.get('history')).toEqual([1, 2])
      }),
    )

    it.effect('gives a lease to the first who asks, and again once it expires', () =>
      Effect.gen(function* () {
        const store = yield* make()
        expect(yield* store.setIfAbsent('lease:1', 'a', 60)).toBe(true)
        expect(yield* store.setIfAbsent('lease:1', 'b', 60)).toBe(false)
        expect(yield* store.get('lease:1')).toBe('a')
        yield* TestClock.adjust('60 seconds')
        expect(yield* store.setIfAbsent('lease:1', 'b', 60)).toBe(true)
      }),
    )

    it.effect('counts up from one, keeping the first expiry', () =>
      Effect.gen(function* () {
        const store = yield* make()
        expect(yield* store.increment('calls', 120)).toBe(1)
        yield* TestClock.adjust('100 seconds')
        expect(yield* store.increment('calls', 120)).toBe(2)
        yield* TestClock.adjust('20 seconds')
        expect(yield* store.increment('calls', 120)).toBe(1)
      }),
    )
  })
}

contract('in-memory', memoryStore)
