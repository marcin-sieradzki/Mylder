import { describe, expect, it } from 'vitest'
import { touchTiltAndTurn, type TouchMap } from './camera.ts'

/** A stand-in for a width media query, which jsdom cannot give, that can cross its breakpoint. */
function phoneWidth(matches: boolean) {
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

/**
 * MapLibre's two-finger gestures, which need WebGL that jsdom lacks: whether a two-finger drag
 * tilts the map and a two-finger twist turns it, both on as a new MapLibre map has them.
 */
function touchMap() {
  const gestures = { tilt: true, twist: true }
  const map = {
    touchPitch: {
      enable: () => void (gestures.tilt = true),
      disable: () => void (gestures.tilt = false),
    },
    touchZoomRotate: {
      enableRotation: () => void (gestures.twist = true),
      disableRotation: () => void (gestures.twist = false),
    },
  }
  return { map: map as unknown as TouchMap, gestures }
}

describe('tilting and turning the map by touch', () => {
  it('lets a two-finger drag tilt the map and a twist turn it, wider than a phone', () => {
    const { map, gestures } = touchMap()
    touchTiltAndTurn(map, phoneWidth(false))
    expect(gestures).toEqual({ tilt: true, twist: true })
  })

  it("keeps a phone's two-finger drag and twist from tilting or turning the map", () => {
    const { map, gestures } = touchMap()
    touchTiltAndTurn(map, phoneWidth(true))
    expect(gestures).toEqual({ tilt: false, twist: false })
  })

  it('follows the width across the breakpoint, until it stops', () => {
    const { map, gestures } = touchMap()
    const width = phoneWidth(false)
    const stop = touchTiltAndTurn(map, width)
    width.change(true)
    expect(gestures).toEqual({ tilt: false, twist: false })
    width.change(false)
    expect(gestures).toEqual({ tilt: true, twist: true })
    stop()
    width.change(true)
    expect(gestures).toEqual({ tilt: true, twist: true })
  })
})
