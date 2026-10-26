// The aircraft's motion: each frame the frame driver (frames.ts) runs, it places every aircraft
// where its motion (aircraft-motion.ts) has it now and writes the point into the aircraft's
// positions, for the canvas to draw with the vehicles (docs/aircraft.md, "The browser"). While
// the driver holds the motion still, the aircraft step to their new places once per answer and
// stand still between. The same answer drawn again, its states turned by the clock, keeps each
// aircraft's motion, glide and all, unless its new state changes its way.
import 'client-only'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import {
  aircraftAt,
  aircraftMotionOf,
  movesAt,
  type AircraftMotion,
  type LonLat,
} from './aircraft-motion.ts'
import type { DrawnAircraft } from './AircraftGlyphLayer.ts'
import type { FrameDriver } from './frames.ts'

export interface AircraftLoopOptions {
  /** The aircraft server's time now, in milliseconds since the epoch. */
  now(): number
  /** The frames the aircraft move in, which render them once each frame. */
  frames: FrameDriver
}

export interface AircraftLoop {
  /**
   * Moves `drawn`, drawn from `snapshot`, each aircraft from where it was last drawn; none
   * clears them. The same snapshot shown again, with new glyphs or states, keeps each one's
   * motion, unless its state now changes its way, as turning No signal stands it at its fix.
   */
  show(drawn: DrawnAircraft | undefined, snapshot?: AircraftSnapshot): void
  stop(): void
}

interface Shown {
  readonly drawn: DrawnAircraft
  readonly snapshot: AircraftSnapshot
  /** Each aircraft's motion, in drawing order. */
  readonly motions: AircraftMotion[]
}

/** Where the `i`th aircraft of `drawn` was last written. */
const pointOf = (drawn: DrawnAircraft, i: number): LonLat => [
  drawn.positions[i * 2],
  drawn.positions[i * 2 + 1],
]

/** Whether two motions of one aircraft from one snapshot take the same way, glides aside. */
const sameWay = (a: AircraftMotion, b: AircraftMotion) =>
  a.step[0] === b.step[0] && a.step[1] === b.step[1]

/** The aircraft's motion, in the frames `frames` runs while an aircraft moves. */
export function aircraftLoop({ now, frames }: AircraftLoopOptions): AircraftLoop {
  let shown: Shown | undefined

  /** Writes each aircraft where its motion has it at `at`. */
  const place = (at: number) => {
    if (!shown) return
    const { drawn, motions } = shown
    motions.forEach((motion, i) => drawn.positions.set(aircraftAt(motion, at), i * 2))
  }

  /** Where each aircraft was last written, by its hex. */
  const drawnPoints = () =>
    new Map<string, LonLat>(shown?.drawn.keys.map((hex, i) => [hex, pointOf(shown!.drawn, i)]))

  /** Each aircraft's motion from `snapshot`, gliding on from where it was drawn, if it was. */
  const motionsOf = (drawn: DrawnAircraft, snapshot: AircraftSnapshot, at: number) => {
    const before = drawnPoints()
    const stilled = frames.still()
    return drawn.aircraft.map((aircraft, i) => {
      const was = before.get(aircraft.hex)
      const from = was && !stilled ? { point: was, at } : undefined
      return aircraftMotionOf(aircraft, snapshot, drawn.states[i], from)
    })
  }

  /**
   * The motions of the same snapshot's aircraft in their states now: each keeps the one it has,
   * gliding on as it was, unless its state changes its way, when it glides to the new one.
   */
  const motionsKept = (drawn: DrawnAircraft, snapshot: AircraftSnapshot, at: number) => {
    const had = new Map(shown?.drawn.keys.map((hex, i) => [hex, shown!.motions[i]]))
    const fresh = motionsOf(drawn, snapshot, at)
    return fresh.map((motion, i) => {
      const kept = had.get(drawn.keys[i])
      return kept && sameWay(kept, motion) ? kept : motion
    })
  }

  const stopDriving = frames.drive({
    moving() {
      const at = now()
      return Boolean(shown?.motions.some((motion) => movesAt(motion, at)))
    },
    frame: () => place(now()),
    // Stilled, the aircraft stand where they are now; moving again, each glides on from there.
    stillness(stilled) {
      const at = now()
      if (stilled || !shown) return place(at)
      shown = { ...shown, motions: motionsOf(shown.drawn, shown.snapshot, at) }
    },
  })

  return {
    show(drawn, snapshot) {
      if (!drawn || !snapshot) {
        shown = undefined
        return frames.request()
      }
      const at = now()
      const sameSnapshot = shown?.snapshot === snapshot
      // Stilled, the same snapshot drawn again, with new states, keeps each where it stands.
      const stands = frames.still() && sameSnapshot
      const before = drawnPoints()
      const motions = sameSnapshot
        ? motionsKept(drawn, snapshot, at)
        : motionsOf(drawn, snapshot, at)
      shown = { drawn, snapshot, motions }
      place(at)
      if (stands) {
        drawn.keys.forEach((hex, i) => {
          const was = before.get(hex)
          if (was) drawn.positions.set(was, i * 2)
        })
      }
      frames.request()
    },
    stop() {
      stopDriving()
      shown = undefined
    },
  }
}
