import { describe, expect, it } from 'vitest'
import { gesturesTiltAndTurn, type GestureMap } from './camera.ts'

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
 * MapLibre's gestures, which need WebGL that jsdom lacks: whether a right-drag or Ctrl-drag tilts
 * and turns the map, a two-finger drag tilts it and a two-finger twist turns it, all on as a new
 * MapLibre map has them.
 */
function gestureMap() {
  const gestures = { drag: true, tilt: true, twist: true }
  const map = {
    dragRotate: {
      enable: () => void (gestures.drag = true),
      disable: () => void (gestures.drag = false),
    },
    touchPitch: {
      enable: () => void (gestures.tilt = true),
      disable: () => void (gestures.tilt = false),
    },
    touchZoomRotate: {
      enableRotation: () => void (gestures.twist = true),
      disableRotation: () => void (gestures.twist = false),
    },
  }
  return { map: map as unknown as GestureMap, gestures }
}

describe('tilting and turning the map by a gesture', () => {
  it('lets a right-drag tilt and turn the map, and two fingers too, wider than a phone', () => {
    const { map, gestures } = gestureMap()
    gesturesTiltAndTurn(map, phoneWidth(false))
    expect(gestures).toEqual({ drag: true, tilt: true, twist: true })
  })

  it("keeps a phone's right-drag, two-finger drag and twist from tilting or turning the map", () => {
    const { map, gestures } = gestureMap()
    gesturesTiltAndTurn(map, phoneWidth(true))
    expect(gestures).toEqual({ drag: false, tilt: false, twist: false })
  })

  it('follows the width across the breakpoint, until it stops', () => {
    const { map, gestures } = gestureMap()
    const width = phoneWidth(false)
    const stop = gesturesTiltAndTurn(map, width)
    width.change(true)
    expect(gestures).toEqual({ drag: false, tilt: false, twist: false })
    width.change(false)
    expect(gestures).toEqual({ drag: true, tilt: true, twist: true })
    stop()
    width.change(true)
    expect(gestures).toEqual({ drag: true, tilt: true, twist: true })
  })
})
