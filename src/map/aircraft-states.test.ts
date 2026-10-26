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

// The fourth aircraft snapshot: SAS506 broadcast its position 0.1 s before the fetch, and
// GRL1762, on the apron at Kastrup, last broadcast its own 60.3 s before it. The states tick on
// the server's whole seconds, which fall half a second after this fetch.
const fourth = saved('0004.json')
const SAS506 = '4caf7e'
const GRL1762 = '45ab23'
/** The aircraft's server runs 30 s ahead of this device. */
const AHEAD = 30_000
const serverAt = (seconds: number) => fourth.fetched + seconds * 1000

/** The page opened `seconds` after the fetch, by the server's clock, with no poll after. */
function openAt(seconds: number) {
  vi.setSystemTime(serverAt(seconds) - AHEAD)
  const live = liveStore<AircraftSnapshot>()
  live.update({ snapshot: fourth, clockOffset: AHEAD })
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
    expect(store.get().get(SAS506)).toBe('live')
    waitUntil(19)
    expect(store.get().get(SAS506)).toBe('live')
    waitUntil(21)
    expect(store.get().get(SAS506)).toBe('ageing')
    waitUntil(59)
    expect(store.get().get(SAS506)).toBe('ageing')
    waitUntil(61)
    expect(store.get().get(SAS506)).toBe('no-signal')
  })

  it('drops a plane once its position is 5 min old', () => {
    const store = openAt(5)
    expect(store.get().get(GRL1762)).toBe('no-signal')
    waitUntil(239)
    expect(store.get().has(GRL1762)).toBe(true)
    waitUntil(241)
    expect(store.get().has(GRL1762)).toBe(false)
  })
})
