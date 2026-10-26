import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import { liveStore } from './live.ts'
import { aircraftStatesAt, aircraftStatesStore } from './aircraft-states.ts'

const saved = (name: string): AircraftSnapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', name), 'utf8'),
  ) as AircraftSnapshot

// The sixth aircraft snapshot: SAS1426 broadcast its position 1 s before the fetch, and EDW62L
// has had only its last position for 124.3 s.
const sixth = saved('0006.json')
const SAS1426 = '45ac2d'
const EDW62L = '4b1a07'
/** The aircraft's server runs 30 s ahead of this device. */
const AHEAD = 30_000
const serverAt = (seconds: number) => sixth.fetched + seconds * 1000

/** The page opened `seconds` after the fetch, by the server's clock, with no poll after. */
function openAt(seconds: number) {
  vi.setSystemTime(serverAt(seconds) - AHEAD)
  const live = liveStore<AircraftSnapshot>()
  live.update({ snapshot: sixth, clockOffset: AHEAD })
  const store = aircraftStatesStore(live)
  store.subscribe(() => {})
  return store
}

/** Moves the device's clock on to `seconds` after the fetch, by the server's clock. */
const waitUntil = (seconds: number) =>
  vi.advanceTimersByTime(serverAt(seconds) - AHEAD - Date.now())

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("each aircraft's data state, by the clock", () => {
  it('agrees with the aircraft source at the moment each saved snapshot was fetched', () => {
    for (let call = 1; call <= 18; call++) {
      const snapshot = saved(`${String(call).padStart(4, '0')}.json`)
      const states = aircraftStatesAt(snapshot, snapshot.fetched)
      expect(snapshot.aircraft.map(({ hex }) => [hex, states.get(hex)])).toEqual(
        snapshot.aircraft.map(({ hex, state }) => [hex, state]),
      )
    }
  })

  it('turns a Live plane Ageing when its position is 20 s old, with no poll', () => {
    const store = openAt(5)
    expect(store.get().get(SAS1426)).toBe('live')
    waitUntil(18)
    expect(store.get().get(SAS1426)).toBe('live')
    waitUntil(19)
    expect(store.get().get(SAS1426)).toBe('ageing')
    waitUntil(59)
    expect(store.get().get(SAS1426)).toBe('no-signal')
  })

  it('drops a plane once its position is 5 min old', () => {
    const store = openAt(5)
    expect(store.get().get(EDW62L)).toBe('no-signal')
    waitUntil(175)
    expect(store.get().has(EDW62L)).toBe(true)
    waitUntil(176)
    expect(store.get().has(EDW62L)).toBe(false)
  })
})
