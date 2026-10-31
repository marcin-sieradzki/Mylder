// The vehicles' motion: each frame the frame driver (frames.ts) runs, it places every dot where
// its motion (motion.ts) has it now and writes the point into the vehicles' positions, and its
// offset onto its line's strand (offsets.ts), for the canvas to draw (docs/live-data.md, "Moving
// between polls"). While the driver holds the motion still, the dots step to their new places
// once per snapshot and stand still between. A trip that cannot be placed stays where the
// snapshot put it, said once, while the others move.
import 'client-only'
import { pointAt, type MeasuredPath } from '../domain/trip-motion.ts'
import type { Network } from '../timetable/network.ts'
import type { Snapshot } from '../tracker/index.ts'
import type { Along } from './follow.ts'
import type { FrameDriver } from './frames.ts'
import { motionOf, placeAt, type Motion } from './motion.ts'
import { writeOffset } from './offsets.ts'
import type { Vehicles } from './vehicles.ts'

export interface LoopOptions {
  /** The server's time now, in milliseconds since the epoch. */
  now(): number
  /** The frames the dots move in, which render them once each frame. */
  frames: FrameDriver
}

export interface VehicleLoop {
  /**
   * Moves `vehicles`, drawn from `snapshot` on its timetable's `network`, each dot from where
   * the same trip was last drawn. The same snapshot shown again, with new glyphs, keeps its
   * dots' motion. Until the network has loaded the dots stand where the snapshot put them.
   */
  show(vehicles: Vehicles, snapshot: Snapshot, network: Network | undefined): void
  /**
   * How far along its path the dot of the trip `key` was last placed, and where the path's last
   * stop lies; none for a trip not drawn, or one that stands where the snapshot put it.
   */
  along(key: string): Along | undefined
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
  /**
   * Each vehicle's mover, in drawing order; none for a trip with no path to move along, or one
   * that could not be placed.
   */
  readonly movers: (Mover | undefined)[]
}

/** Whether two sets of vehicles are the same trips in the same order. */
const sameTrips = (a: Vehicles, b: Vehicles): boolean =>
  a.length === b.length && a.keys.every((key, i) => key === b.keys[i])

/** The vehicles' motion, in the frames `frames` runs while there are vehicles to move. */
export function vehicleLoop({ now, frames }: LoopOptions): VehicleLoop {
  let shown: Shown | undefined
  const { still } = frames

  const cannotPlace = (key: string, error: unknown) =>
    console.error(`The trip ${key} could not be placed`, error)
  /** Stops moving the `i`th dot, which stays where it was last written. */
  const drop = (i: number, error: unknown) => {
    if (!shown) return
    shown.movers[i] = undefined
    cannotPlace(shown.vehicles.keys[i], error)
  }

  /** Writes each dot where it was last placed, for the next render. */
  const write = () => {
    if (!shown) return
    const { vehicles, movers } = shown
    movers.forEach((mover, i) => {
      if (!mover) return
      try {
        const [lat, lon] = pointAt(mover.path, mover.progress)
        vehicles.positions[i * 2] = lon
        vehicles.positions[i * 2 + 1] = lat
        writeOffset(vehicles, i, mover.path, mover.progress)
        vehicles.opacity[i] = mover.opacity
      } catch (error) {
        drop(i, error)
      }
    })
  }
  /** Places each dot where its motion has it at `at`. */
  const place = (at: number) => {
    const stilled = still()
    shown?.movers.forEach((mover, i) => {
      if (!mover) return
      try {
        const { progress, opacity } = placeAt(mover.motion, at)
        mover.progress = progress
        // A dot stilled mid-fade stands whole.
        mover.opacity = stilled ? 1 : opacity
      } catch (error) {
        drop(i, error)
      }
    })
    write()
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
    const stilled = still()
    // Stilled, the same snapshot drawn with other trips keeps each dot where it stands.
    const again = shown?.snapshot === snapshot
    return vehicles.trips.map((trip) => {
      if (!network?.patterns.patterns[trip.pattern]) return undefined
      const path = network.pathOf(trip.pattern)
      if (path.points.length === 0) return undefined
      const was = before.get(trip.key)
      const kept = was?.path === path ? was : undefined
      if (kept && stilled && again) return kept
      const drawn = kept && !stilled ? { progress: kept.progress, at } : undefined
      try {
        const motion = motionOf(trip, snapshot.fetched, path, drawn)
        return { motion, path, ...placeAt(motion, at) }
      } catch (error) {
        cannotPlace(trip.key, error)
        return undefined
      }
    })
  }

  // Stilled, the dots stop where they are; moving again, each eases on from there.
  const stopDriving = frames.drive({
    moving: () => Boolean(shown?.movers.some(Boolean)),
    frame: () => place(now()),
    stillness(stilled) {
      if (stilled) return place(now())
      if (!shown) return
      const at = now()
      const { snapshot } = shown
      shown.movers.forEach((mover, i) => {
        if (!mover) return
        const trip = shown!.vehicles.trips[i]
        const drawn = { progress: mover.progress, at }
        mover.motion = motionOf(trip, snapshot.fetched, mover.path, drawn)
      })
    },
  })

  return {
    show(vehicles, snapshot, network) {
      const at = now()
      // A filter turned on or off shows the same snapshot with other trips: each moves on from
      // where it stands rather than taking another's motion.
      const again = shown && shown.snapshot === snapshot && shown.network === network
      const movers =
        again && sameTrips(shown!.vehicles, vehicles)
          ? shown!.movers
          : moversOf(vehicles, snapshot, network, at)
      shown = { vehicles, snapshot, network, movers }
      // The same snapshot again brings new glyphs or filters only: stilled dots stay put.
      if (again && still()) write()
      else place(at)
      frames.request()
    },
    along(key) {
      if (!shown) return undefined
      const mover = shown.movers[shown.vehicles.keys.indexOf(key)]
      if (!mover) return undefined
      return { progress: mover.progress, end: mover.path.stops.at(-1) ?? mover.path.length }
    },
    stop() {
      stopDriving()
      shown = undefined
    },
  }
}
