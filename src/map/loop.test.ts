import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pointAt } from '../domain/trip-motion.ts'
import { readNetwork } from '../timetable/network.ts'
import type { Snapshot } from '../tracker/index.ts'
import { vehicleLoop, type VehicleLoop } from './loop.ts'
import { readPaint } from './paint.ts'
import { motionPauseStore, type MotionPause } from './pause.ts'
import { vehiclePaint, vehiclesOf, type Vehicles } from './vehicles.ts'

// The weekday recording's sixth and seventh minutes on its own timetable. A runs from 12,550 m at
// fetch to 14,350 m 60 s later, and the seventh minute agrees, so it carries on from there.
const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): unknown => JSON.parse(readFileSync(join(recording, path), 'utf8'))
const manifest = read('timetable/manifest.json') as { files: Record<string, string> }
const network = readNetwork({
  manifest,
  stops: read(`timetable/${manifest.files.stops}`),
  patterns: read(`timetable/${manifest.files.patterns}`),
  paths: read(`timetable/${manifest.files.paths}`),
})
const minute6 = read('snapshots/0006.json') as Snapshot
const minute7 = read('snapshots/0007.json') as Snapshot
const s = (seconds: number) => minute6.fetched + seconds * 1000

const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
const A_PATTERN = minute6.trips.find((trip) => trip.key === A_LIVE)!.pattern

const vehiclesFrom = (snapshot: Snapshot) =>
  vehiclesOf(snapshot, network, readPaint(document.documentElement, vehiclePaint(network)))

/** Where A is drawn, as longitude and latitude. */
const drawnA = (vehicles: Vehicles) => {
  const i = vehicles.keys.indexOf(A_LIVE)
  return [...vehicles.positions.subarray(i * 2, i * 2 + 2)]
}

/** How far, in metres, A is drawn from the point `progress` metres along its path: a frame is 16 ms. */
const offA = (vehicles: Vehicles, progress: number) => {
  const [lat, lon] = pointAt(network.pathOf(A_PATTERN), progress)
  const [drawnLon, drawnLat] = drawnA(vehicles)
  const metresPerDegree = 111_320
  return Math.hypot(
    (drawnLon - lon) * metresPerDegree * Math.cos((lat * Math.PI) / 180),
    (drawnLat - lat) * metresPerDegree,
  )
}

/** A stand-in for the system's reduced-motion setting, which jsdom cannot give. */
function reducedMotion(matches: boolean) {
  const listeners = new Set<() => void>()
  return {
    matches,
    addEventListener: (_: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_: 'change', listener: () => void) => listeners.delete(listener),
    change(to: boolean) {
      this.matches = to
      for (const listener of listeners) listener()
    },
  }
}

let loop: VehicleLoop | undefined
let pause: MotionPause

function start(prefersReduced = false) {
  const media = reducedMotion(prefersReduced)
  loop = vehicleLoop({ now: () => Date.now(), draw: () => {}, pause, reducedMotion: media })
  return media
}

/** Lets the frames run for `ms`. */
const wait = (ms: number) => vi.advanceTimersByTime(ms)

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  pause = motionPauseStore()
})

afterEach(() => {
  loop?.stop()
  loop = undefined
  vi.useRealTimers()
})

describe('the vehicles between polls', () => {
  it('moves every dot along its path each frame, from where it is now when the page opens', () => {
    vi.setSystemTime(s(10))
    start()
    const vehicles = vehiclesFrom(minute6)
    loop!.show(vehicles, minute6, network)
    // Opened 10 s after fetch: 300 m on, at 30 m/s.
    expect(offA(vehicles, 12850)).toBeLessThan(1)
    wait(1000)
    expect(offA(vehicles, 12880)).toBeLessThan(1)
    wait(20_000)
    expect(offA(vehicles, 13480)).toBeLessThan(1)
  })

  it('keeps each dot on its own path when a mode filter changes which trips are drawn', () => {
    vi.setSystemTime(s(10))
    start()
    loop!.show(vehiclesFrom(minute6), minute6, network)
    wait(5000)
    const paint = readPaint(document.documentElement, vehiclePaint(network))
    const withoutBuses = vehiclesOf(minute6, network, paint, undefined, {
      hidden: new Set(['bus']),
    })
    loop!.show(withoutBuses, minute6, network)
    // At 15 s, 450 m on from fetch, at 30 m/s, as if nothing had been filtered.
    expect(offA(withoutBuses, 13000)).toBeLessThan(1)
    wait(5000)
    expect(offA(withoutBuses, 13150)).toBeLessThan(1)
  })

  it('keeps the dots where the snapshot puts them until its timetable has loaded', () => {
    vi.setSystemTime(s(10))
    start()
    const vehicles = vehiclesFrom(minute6)
    const fetchedAt = drawnA(vehicles)
    loop!.show(vehicles, minute6, undefined)
    wait(5000)
    expect(drawnA(vehicles)).toEqual(fetchedAt)
  })

  it('carries a dot on from where it was drawn when the next snapshot lands', () => {
    vi.setSystemTime(s(10))
    start()
    loop!.show(vehiclesFrom(minute6), minute6, network)
    wait(55_000)
    const next = vehiclesFrom(minute7)
    loop!.show(next, minute7, network)
    // At 65 s, 14,350 m plus 5 s at 5.75 m/s.
    expect(offA(next, 14378.75)).toBeLessThan(1)
    wait(10_000)
    expect(offA(next, 14436.25)).toBeLessThan(1)
  })

  it('steps the dots only when a snapshot lands, when the system asks for reduced motion', () => {
    vi.setSystemTime(s(10))
    start(true)
    const vehicles = vehiclesFrom(minute6)
    loop!.show(vehicles, minute6, network)
    expect(offA(vehicles, 12850)).toBeLessThan(1)
    wait(30_000)
    expect(offA(vehicles, 12850)).toBeLessThan(1)
    // The seventh minute lands at 65 s: A steps to where it is then, and stays.
    vi.setSystemTime(s(65))
    const next = vehiclesFrom(minute7)
    loop!.show(next, minute7, network)
    expect(offA(next, 14378.75)).toBeLessThan(1)
    wait(10_000)
    expect(offA(next, 14378.75)).toBeLessThan(1)
  })

  it('stops the dots while paused, steps them per snapshot, and moves them again after', () => {
    vi.setSystemTime(s(10))
    const media = start()
    const vehicles = vehiclesFrom(minute6)
    loop!.show(vehicles, minute6, network)
    pause.set(true)
    expect(offA(vehicles, 12850)).toBeLessThan(1)
    wait(30_000)
    expect(offA(vehicles, 12850)).toBeLessThan(1)
    // A state turning by the clock redraws the glyphs, and moves nothing.
    const reglyphed = vehiclesFrom(minute6)
    loop!.show(reglyphed, minute6, network)
    expect(offA(reglyphed, 12850)).toBeLessThan(1)
    vi.setSystemTime(s(65))
    const next = vehiclesFrom(minute7)
    loop!.show(next, minute7, network)
    expect(offA(next, 14378.75)).toBeLessThan(1)
    wait(10_000)
    expect(offA(next, 14378.75)).toBeLessThan(1)
    // Unpaused at 75 s, the dot eases on to where the timeline has it, and follows it.
    pause.set(false)
    wait(5000)
    expect(offA(next, 14350 + 5.75 * 20)).toBeLessThan(1)
    // Reduced motion, turned on, stills them too.
    media.change(true)
    const still = drawnA(next)
    wait(5000)
    expect(drawnA(next)).toEqual(still)
  })
})
