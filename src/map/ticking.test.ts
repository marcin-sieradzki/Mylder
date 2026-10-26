import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveStore } from './live.ts'
import { tickingStore } from './ticking.ts'

// The ticking store over a made-up second kind of snapshot: it ticks on that snapshot's own
// server's clock, from the offset its store's answers gave, whatever the transit one says.

/** A made-up second kind of snapshot: beacons, each heard at a moment on its server's clock. */
interface Beacons {
  readonly fetched: number
  readonly nextDue: number
  readonly pollInterval: number
  readonly beacons: readonly { readonly id: string; readonly heard: number }[]
}

const S = 1000
const FETCHED = Date.parse('2026-06-16T05:20:00Z')
/** The beacons' server runs 35 s ahead of this device. */
const AHEAD = 35 * S

/** The beacons heard in the last 20 s at `now`. */
const heardAt = ({ snapshot }: { snapshot?: Beacons }, now: number) =>
  (snapshot?.beacons ?? []).filter(({ heard }) => now - heard < 20 * S).map(({ id }) => id)

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i])

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the ticking store over a second kind of snapshot', () => {
  it("ticks on each whole second of its own server's clock", () => {
    // This device reads 05:19:35 while the beacons' server reads 05:20:10.
    vi.setSystemTime(FETCHED + 10 * S - AHEAD)
    const beacons = liveStore<Beacons>()
    beacons.update({
      snapshot: {
        fetched: FETCHED,
        nextDue: FETCHED + 10 * S,
        pollInterval: 10,
        beacons: [
          { id: 'north', heard: FETCHED - 15 * S },
          { id: 'south', heard: FETCHED + 2 * S },
        ],
      },
      clockOffset: AHEAD,
    })
    const heard = tickingStore(heardAt, sameIds, beacons)
    const changes = vi.fn<() => void>()
    heard.subscribe(changes)
    expect(heard.get()).toEqual(['south'])
    // At the beacons' 05:20:21.5, 'south' was heard 19.5 s ago.
    vi.advanceTimersByTime(11.5 * S)
    expect(heard.get()).toEqual(['south'])
    expect(changes).not.toHaveBeenCalled()
    // On the tick of 05:20:22, 20 s after it was heard, it goes quiet.
    vi.advanceTimersByTime(0.5 * S)
    expect(heard.get()).toEqual([])
    expect(changes).toHaveBeenCalledTimes(1)
  })
})
