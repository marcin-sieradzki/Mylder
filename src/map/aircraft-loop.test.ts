import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { distance } from '../domain/trip-motion.ts'
import { aircraftLookNow } from '../test/aircraftIcon.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import { aircraftLoop, type AircraftLoop } from './aircraft-loop.ts'
import { aircraftStatesAt } from './aircraft-states.ts'
import { aircraftOf, type DrawnAircraft } from './AircraftGlyphLayer.ts'
import { frameDriver, type FrameDriver } from './frames.ts'
import { motionPauseStore, type MotionPause } from './pause.ts'

// The weekday recording's last two aircraft snapshots, 10 s apart: SAS4304 on short final at
// 116.9 kn (60.14 m/s), its position broadcast 0.2 s before the first's fetch, then at 118.3 kn
// (60.86 m/s), its position 0.1 s before the second's; 45ab23, a 737 on the ground at Kastrup.
const read = (name: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', name), 'utf8'),
  ) as AircraftSnapshot
const first = read('0017.json')
const second = read('0018.json')
const s = (seconds: number) => first.fetched + seconds * 1000
const SAS4304 = '4acaa6'
const ON_GROUND = '45ab23'

const drawnFrom = (snapshot: AircraftSnapshot, at: number) =>
  aircraftOf(snapshot, aircraftLookNow(), aircraftStatesAt(snapshot, at))

/** Where `hex` is drawn, as longitude and latitude. */
const where = (drawn: DrawnAircraft, hex: string) => {
  const i = drawn.keys.indexOf(hex)
  return [drawn.positions[i * 2], drawn.positions[i * 2 + 1]] as const
}

/** How far, in metres, `hex` is drawn from its fix in `snapshot`. */
const fromFix = (drawn: DrawnAircraft, hex: string, snapshot: AircraftSnapshot = first) => {
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

/** How far `metres` is from `expected`: under 2 m is within two frames' travel at 61 m/s. */
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
    const drawn = drawnFrom(first, s(0))
    loop!.show(drawn, first)
    // 0.2 s after its position at the fetch; 3.2 s after it 3 s later.
    expect(off(fromFix(drawn, SAS4304), 12.03)).toBeLessThan(2)
    wait(3000)
    expect(off(fromFix(drawn, SAS4304), 192.44)).toBeLessThan(2)
    expect(fromFix(drawn, ON_GROUND)).toBe(0)
  })

  it('stops it one poll interval past its position, and the frames with the last to stop', () => {
    vi.setSystemTime(s(0))
    start()
    const drawn = drawnFrom(first, s(0))
    loop!.show(drawn, first)
    // Its position is from 0.2 s before the fetch: 10 s on is 9.8 s after the fetch, 601.39 m on.
    wait(9900)
    const stopped = where(drawn, SAS4304)
    expect(off(fromFix(drawn, SAS4304), 601.39)).toBeLessThan(2)
    wait(2000)
    expect(where(drawn, SAS4304)).toEqual(stopped)
    const before = renders
    wait(5000)
    expect(renders).toBe(before)
  })

  it('glides on from where it was drawn when the next answer lands', () => {
    vi.setSystemTime(s(0))
    start()
    loop!.show(drawnFrom(first, s(0)), first)
    wait(10_500)
    const next = drawnFrom(second, s(10.5))
    loop!.show(next, second)
    // Its new position is from 9.9 s, 0.1 s before the second's fetch: at 12 s, 2.1 s on.
    wait(1500)
    expect(off(fromFix(next, SAS4304, second), 127.8)).toBeLessThan(2)
  })

  it('keeps each aircraft gliding from where it was when a state turns by the clock', () => {
    vi.setSystemTime(s(0))
    start()
    loop!.show(drawnFrom(first, s(0)), first)
    wait(10_500)
    loop!.show(drawnFrom(second, s(10.5)), second)
    // Mid-glide, the same answer drawn again in its states now leaves each on its glide.
    wait(300)
    const again = drawnFrom(second, s(10.8))
    loop!.show(again, second)
    // The glide ends a second after the answer landed, on its way: at 11.5 s, 1.6 s on.
    wait(700)
    expect(off(fromFix(again, SAS4304, second), 97.37)).toBeLessThan(2)
  })

  it('stands the aircraft while paused, steps them per answer, and moves them again after', () => {
    vi.setSystemTime(s(0))
    start()
    const drawn = drawnFrom(first, s(0))
    loop!.show(drawn, first)
    wait(2000)
    pause.set(true)
    const paused = where(drawn, SAS4304)
    wait(3000)
    expect(where(drawn, SAS4304)).toEqual(paused)
    // A state turning by the clock draws them again where they stand.
    const again = drawnFrom(first, s(5))
    loop!.show(again, first)
    expect(where(again, SAS4304)).toEqual(paused)
    // The next answer steps them to where they are when it lands: at 12 s, 2.1 s on.
    vi.setSystemTime(s(12))
    const next = drawnFrom(second, s(12))
    loop!.show(next, second)
    expect(off(fromFix(next, SAS4304, second), 127.8)).toBeLessThan(2)
    wait(2000)
    expect(off(fromFix(next, SAS4304, second), 127.8)).toBeLessThan(2)
    // Moving again at 14 s, it glides on: at 16 s, 6.1 s on.
    pause.set(false)
    wait(2000)
    expect(off(fromFix(next, SAS4304, second), 371.24)).toBeLessThan(2)
  })
})
