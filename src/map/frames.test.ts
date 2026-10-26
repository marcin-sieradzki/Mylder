import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameDriver, type FrameDriver, type Movers } from './frames.ts'
import { motionPauseStore, type MotionPause } from './pause.ts'

// The frame driver over two made-up kinds of moving thing, each a counter of the frames it was
// placed in that moves until its time is up.

/** A kind whose things move until `until`, on the device's clock. */
function kind(until: number) {
  const heard: boolean[] = []
  let placed = 0
  const movers: Movers = {
    moving: () => Date.now() < until,
    frame: () => placed++,
    stillness: (stilled) => heard.push(stilled),
  }
  return { movers, heard, placed: () => placed }
}

let driver: FrameDriver | undefined
let pause: MotionPause
let renders = 0

function start() {
  driver = frameDriver({ render: () => renders++, pause, reducedMotion: null })
  return driver
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  vi.setSystemTime(0)
  pause = motionPauseStore()
  renders = 0
})

afterEach(() => {
  driver?.stop()
  driver = undefined
  vi.useRealTimers()
})

describe('the frame driver', () => {
  it('places every kind each frame and renders once, while any of them moves', () => {
    const frames = start()
    const short = kind(500)
    const long = kind(1000)
    frames.drive(short.movers)
    frames.drive(long.movers)
    frames.request()
    vi.advanceTimersByTime(2000)
    // Frames run until the longer one stops, and each places both kinds, then renders once.
    expect(long.placed()).toBeGreaterThan(55)
    expect(short.placed()).toBe(long.placed())
    expect(renders).toBe(long.placed())
    const before = renders
    vi.advanceTimersByTime(1000)
    expect(renders).toBe(before)
  })

  it('renders once in the next frame for any number of asks, with nothing moving', () => {
    const frames = start()
    frames.drive(kind(0).movers)
    frames.request()
    frames.request()
    frames.request()
    vi.advanceTimersByTime(1000)
    expect(renders).toBe(1)
  })

  it('places nothing while paused, tells each kind, and moves them again after', () => {
    const frames = start()
    const moving = kind(Infinity)
    frames.drive(moving.movers)
    frames.request()
    vi.advanceTimersByTime(100)
    pause.set(true)
    const placed = moving.placed()
    vi.advanceTimersByTime(1000)
    expect(moving.placed()).toBe(placed)
    expect(frames.still()).toBe(true)
    pause.set(false)
    vi.advanceTimersByTime(100)
    expect(moving.placed()).toBeGreaterThan(placed)
    expect(moving.heard).toEqual([true, false])
  })
})
