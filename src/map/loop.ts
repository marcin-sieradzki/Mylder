// The vehicles' animation loop: outside React, each frame it places every dot where its motion
// (motion.ts) has it now and writes the point into the vehicles' positions, then hands them to
// the canvas (docs/live-data.md, "Moving between polls"). Under the system's reduced motion
// setting, or while the pause control holds, it runs no frames: the dots step to their new
// places once per snapshot and stand still between.
import 'client-only'
import { pointAt, type MeasuredPath } from '../domain/trip-motion.ts'
import type { Network } from '../timetable/network.ts'
import type { Snapshot } from '../tracker/index.ts'
import { motionOf, placeAt, type Motion } from './motion.ts'
import { motionPause, type MotionPause } from './pause.ts'
import type { Vehicles } from './vehicles.ts'

/** The part of a `MediaQueryList` the loop reads. */
export interface MediaSetting {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export interface LoopOptions {
  /** The server's time now, in milliseconds since the epoch. */
  now(): number
  /** Draws the vehicles, whose positions and opacities have just been written. */
  draw(vehicles: Vehicles): void
  pause?: MotionPause
  /** The system's reduced-motion setting; none where the browser has no media queries. */
  reducedMotion?: MediaSetting | null
}

export interface VehicleLoop {
  /**
   * Moves `vehicles`, drawn from `snapshot` on its timetable's `network`, each dot from where
   * the same trip was last drawn. The same snapshot shown again, with new glyphs, keeps its
   * dots' motion. Until the network has loaded the dots stand where the snapshot put them.
   */
  show(vehicles: Vehicles, snapshot: Snapshot, network: Network | undefined): void
  stop(): void
}

/** One trip's dot, on the path it moves along. */
interface Mover {
  motion: Motion
  readonly path: MeasuredPath
  /** Where it was last placed, as metres along the path, and how opaque. */
  progress: number
  opacity: number
}

interface Shown {
  readonly vehicles: Vehicles
  readonly snapshot: Snapshot
  readonly network: Network | undefined
  /** Each vehicle's mover, in drawing order; none for a trip with no path to move along. */
  readonly movers: readonly (Mover | undefined)[]
}

const systemReducedMotion = (): MediaSetting | null =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

/** A loop that runs frames while there are vehicles to move and the motion isn't stilled. */
export function vehicleLoop({
  now,
  draw,
  pause = motionPause,
  reducedMotion = systemReducedMotion(),
}: LoopOptions): VehicleLoop {
  let shown: Shown | undefined
  let frame: number | undefined
  const still = () => pause.get() || Boolean(reducedMotion?.matches)

  /** Writes each dot where it was last placed, and draws them. */
  const write = () => {
    if (!shown) return
    const { vehicles, movers } = shown
    movers.forEach((mover, i) => {
      if (!mover) return
      const [lat, lon] = pointAt(mover.path, mover.progress)
      vehicles.positions[i * 2] = lon
      vehicles.positions[i * 2 + 1] = lat
      vehicles.opacity[i] = mover.opacity
    })
    draw(vehicles)
  }
  /** Places each dot where its motion has it at `at`. */
  const place = (at: number) => {
    const stilled = still()
    for (const mover of shown?.movers ?? []) {
      if (!mover) continue
      const { progress, opacity } = placeAt(mover.motion, at)
      mover.progress = progress
      // A dot stilled mid-fade stands whole.
      mover.opacity = stilled ? 1 : opacity
    }
    write()
  }

  const run = () => {
    place(now())
    frame = requestAnimationFrame(run)
  }
  const halt = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  /** Each trip's motion from the snapshot, from where its dot stands now when it moves on. */
  const moversOf = (
    vehicles: Vehicles,
    snapshot: Snapshot,
    network: Network | undefined,
    at: number,
  ): (Mover | undefined)[] => {
    const before = new Map<string, Mover>()
    if (shown && shown.network === network) {
      const { keys } = shown.vehicles
      shown.movers.forEach((mover, i) => mover && before.set(keys[i], mover))
    }
    return vehicles.trips.map((trip) => {
      if (!network?.patterns.patterns[trip.pattern]) return undefined
      const path = network.pathOf(trip.pattern)
      const was = before.get(trip.key)
      const drawn =
        was && was.path === path && !still() ? { progress: was.progress, at } : undefined
      const motion = motionOf(trip, snapshot.fetched, path, drawn)
      return { motion, path, ...placeAt(motion, at) }
    })
  }

  // Stilled, the dots stop where they are; moving again, each eases on from there.
  const onStillness = () => {
    if (still()) {
      halt()
      place(now())
      return
    }
    if (!shown || frame !== undefined) return
    const at = now()
    const { snapshot } = shown
    shown.movers.forEach((mover, i) => {
      if (!mover) return
      const trip = shown!.vehicles.trips[i]
      const drawn = { progress: mover.progress, at }
      mover.motion = motionOf(trip, snapshot.fetched, mover.path, drawn)
    })
    run()
  }
  const stopPause = pause.subscribe(onStillness)
  reducedMotion?.addEventListener('change', onStillness)

  return {
    show(vehicles, snapshot, network) {
      const at = now()
      const same = shown && shown.snapshot === snapshot && shown.network === network
      const movers = same ? shown!.movers : moversOf(vehicles, snapshot, network, at)
      shown = { vehicles, snapshot, network, movers }
      // The same snapshot again brings new glyphs only: stilled dots stay where they stand.
      if (same && still()) write()
      else if (!movers.some(Boolean) || still()) {
        halt()
        place(at)
      } else if (frame === undefined) run()
      else place(at)
    },
    stop() {
      halt()
      stopPause()
      reducedMotion?.removeEventListener('change', onStillness)
      shown = undefined
    },
  }
}
