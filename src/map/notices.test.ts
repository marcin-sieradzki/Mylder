import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { snapshotStore } from './live.ts'
import { pageNoticesStore } from './notices.ts'

// The notices store's own promise, which the screen tests can't see: a read between ticks gives
// what the subscribers last heard, so no read swallows a change they should hear of.

const saved = (name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', name), 'utf8'),
  ) as Snapshot

/** The sixth minute with Rejseplanen failing since 07:24, after the answer of 07:23:00. */
const failing: Snapshot = {
  ...saved('0006.json'),
  source: { kind: 'rejseplanen' },
  api: { status: 'error', since: Date.parse('2026-06-16T05:24:00Z'), kind: 'status' },
  lastSeen: saved('0004.json').lastSeen,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the page notices, by the clock', () => {
  it('gives every read between ticks what its subscribers last heard', () => {
    // Alternating modes: the Live limit is 4 min, so Paused shows at 07:27:00.
    vi.setSystemTime(Date.parse('2026-06-16T05:26:59.500Z'))
    const live = snapshotStore()
    live.update({ snapshot: failing, clockOffset: 0 })
    const store = pageNoticesStore(live)
    const changes = vi.fn<() => void>()
    store.subscribe(changes)
    changes.mockClear()
    const before = store.get()
    vi.setSystemTime(Date.parse('2026-06-16T05:27:00Z'))
    expect(store.get()).toBe(before)
    expect(store.get()).toEqual([])
    vi.advanceTimersByTime(500)
    expect(store.get()).toEqual([
      { kind: 'paused', reason: 'no-answer', since: Date.parse('2026-06-16T05:23:00Z') },
    ])
    expect(changes).toHaveBeenCalledTimes(1)
  })
})
