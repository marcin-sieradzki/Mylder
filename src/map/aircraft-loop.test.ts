import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { distance } from '../domain/trip-motion.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import { aircraftLoop, type AircraftLoop } from './aircraft-loop.ts'
import { aircraftStatesAt } from './aircraft-states.ts'
import { aircraftOf, aircraftPaint, type DrawnAircraft } from './AircraftGlyphLayer.ts'
import { frameDriver, type FrameDriver } from './frames.ts'
import { readPaint } from './paint.ts'
import { motionPauseStore, type MotionPause } from './pause.ts'

// The weekday recording's sixth and seventh aircraft snapshots, 10 s apart: SAS1426 on short final
// at 142 kn (73.05 m/s), its position broadcast 1 s before the sixth's fetch; KLM1271 climbing out
// at 210 kn (108.03 m/s), its position 1.7 s before the seventh's; SAS2863 taxiing.
const read = (name: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', name), 'utf8'),
  ) as AircraftSnapshot
const sixth = read('0006.json')
const seventh = read('0007.json')
const s = (seconds: number) => sixth.fetched + seconds * 1000
const SAS1426 = '45ac2d'
const KLM1271 = '484cb6'
const SAS2863 = '45ab45'

const drawnFrom = (snapshot: AircraftSnapshot, at: number) =>
  aircraftOf(
    snapshot,
    readPaint(document.documentElement, aircraftPaint()),
    aircraftStatesAt(snapshot, at),
  )

/** Where `hex` is drawn, as longitude and latitude. */
const where = (drawn: DrawnAircraft, hex: string) => {
  const i = drawn.keys.indexOf(hex)
  return [drawn.positions[i * 2], drawn.positions[i * 2 + 1]] as const
}

/** How far, in metres, `hex` is drawn from its fix in `snapshot`. */
const fromFix = (drawn: DrawnAircraft, hex: string, snapshot: AircraftSnapshot = sixth) => {
  const fix = snapshot.aircraft.find((each) => each.hex === hex)!
  const [lon, lat] = where(drawn, hex)
  return distance([fix.lat, fix.lon], [lat, lon])
}

let frames: FrameDriver | undefined
let loop: AircraftLoop | undefined
let pause: MotionPause
let renders = 0

function start() {
  frames = frameDriver({ render: () => renders++, pause, reducedMotion: null })
  loop = aircraftLoop({ now: () => Date.now(), frames })
}

const wait = (ms: number) => vi.advanceTimersByTime(ms)

/** How far `metres` is from `expected`: under 2 m is within one frame's travel at 108 m/s. */
const off = (metres: number, expected: number) => Math.abs(metres - expected)

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  pause = motionPauseStore()
  renders = 0
})

afterEach(() => {
  loop?.stop()
  frames?.stop()
  loop = undefined
  frames = undefined
  vi.useRealTimers()
})

describe('the aircraft between polls', () => {
  it('moves each aircraft along its track each frame, and stands one on the ground', () => {
    vi.setSystemTime(s(0))
    start()
    const drawn = drawnFrom(sixth, s(0))
    loop!.show(drawn, sixth)
    // 1 s after its position at the fetch; 4 s after it 3 s later.
    expect(off(fromFix(drawn, SAS1426), 73.05)).toBeLessThan(2)
    wait(3000)
    expect(off(fromFix(drawn, SAS1426), 292.2)).toBeLessThan(2)
    expect(fromFix(drawn, SAS2863)).toBe(0)
  })

  it('stops it one poll interval past its position, and the frames with the last to stop', () => {
    vi.setSystemTime(s(0))
    start()
    const drawn = drawnFrom(sixth, s(0))
    loop!.show(drawn, sixth)
    // Its position is from 1 s before the fetch: 10 s on is 9 s after the fetch, 730.5 m on.
    wait(9100)
    const stopped = where(drawn, SAS1426)
    expect(off(fromFix(drawn, SAS1426), 730.5)).toBeLessThan(2)
    wait(2000)
    expect(where(drawn, SAS1426)).toEqual(stopped)
    const before = renders
    wait(5000)
    expect(renders).toBe(before)
  })

  it('glides on from where it was drawn when the next answer lands', () => {
    vi.setSystemTime(s(0))
    start()
    loop!.show(drawnFrom(sixth, s(0)), sixth)
    wait(10_500)
    const next = drawnFrom(seventh, s(10.5))
    loop!.show(next, seventh)
    // Its new position is from 8.3 s, 1.7 s before the seventh's fetch: at 12 s, 3.7 s on.
    wait(1500)
    expect(off(fromFix(next, KLM1271, seventh), 399.7)).toBeLessThan(2)
  })

  it('keeps each aircraft gliding from where it was when a state turns by the clock', () => {
    vi.setSystemTime(s(0))
    start()
    loop!.show(drawnFrom(sixth, s(0)), sixth)
    wait(10_500)
    loop!.show(drawnFrom(seventh, s(10.5)), seventh)
    // Mid-glide, the same answer drawn again in its states now leaves each on its glide.
    wait(300)
    const again = drawnFrom(seventh, s(10.8))
    loop!.show(again, seventh)
    // The glide ends a second after the answer landed, on its way: at 11.5 s, 3.2 s on.
    wait(700)
    expect(off(fromFix(again, KLM1271, seventh), 345.7)).toBeLessThan(2)
  })

  it('stands the aircraft while paused, steps them per answer, and moves them again after', () => {
    vi.setSystemTime(s(0))
    start()
    const drawn = drawnFrom(sixth, s(0))
    loop!.show(drawn, sixth)
    wait(2000)
    pause.set(true)
    const paused = where(drawn, KLM1271)
    wait(3000)
    expect(where(drawn, KLM1271)).toEqual(paused)
    // A state turning by the clock draws them again where they stand.
    const again = drawnFrom(sixth, s(5))
    loop!.show(again, sixth)
    expect(where(again, KLM1271)).toEqual(paused)
    // The next answer steps them to where they are when it lands: at 12 s, 3.7 s on.
    vi.setSystemTime(s(12))
    const next = drawnFrom(seventh, s(12))
    loop!.show(next, seventh)
    expect(off(fromFix(next, KLM1271, seventh), 399.7)).toBeLessThan(2)
    wait(2000)
    expect(off(fromFix(next, KLM1271, seventh), 399.7)).toBeLessThan(2)
    // Moving again at 14 s, it glides on: at 16 s, 7.7 s on.
    pause.set(false)
    wait(2000)
    expect(off(fromFix(next, KLM1271, seventh), 831.8)).toBeLessThan(2)
  })
})
