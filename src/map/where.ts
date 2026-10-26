// Where a vehicle is, as its panel says it in words (docs/screens.md, "Vehicle detail"): at a
// stop, between two, Waiting at its first stop, or for a No signal trip, near the stop where it was
// last seen. Read from the trip's place on its pattern the way the map places its dot (motion.ts),
// so the words and the dot agree. Stops are indexes in the pattern's calling order; the panel
// names them.
import type { DataState } from '../domain/data-state.ts'
import {
  progressAt,
  timelineOf,
  type MeasuredPath,
  type TimedCall,
} from '../domain/trip-motion.ts'
import type { SnapshotTrip } from '../tracker/index.ts'
import { motionOf } from './motion.ts'

export type Where =
  | { readonly kind: 'waiting'; readonly stop: number; readonly departs: number }
  | { readonly kind: 'at'; readonly stop: number }
  | { readonly kind: 'between'; readonly from: number; readonly to: number }
  | { readonly kind: 'near'; readonly stop: number }

/** A dot this close to a stop along its path, in metres, is at it. */
export const AT_STOP = 50

export interface WhereInput {
  /** The trip as the snapshot carries it. */
  readonly trip: SnapshotTrip
  /** Its data state now, by the clock. */
  readonly state: DataState
  /** When the snapshot was fetched. */
  readonly fetched: number
  /** Its pattern's path. */
  readonly path: MeasuredPath
  /** Its times at every call, as its answer keeps them, for where they had it when last seen. */
  readonly calls: readonly TimedCall[]
  readonly now: number
}

/** The stop nearest a distance along the path. */
function nearest(path: MeasuredPath, progress: number): number {
  let best = 0
  path.stops.forEach((at, i) => {
    if (Math.abs(at - progress) < Math.abs(path.stops[best] - progress)) best = i
  })
  return best
}

/**
 * Where a No signal trip was when an answer last carried it: where that snapshot put it, or, from
 * an older answer, where its times had it then, as the No signal dot moves on those times.
 */
function lastSeenAt({ trip, fetched, path, calls }: WhereInput): number {
  const seen = trip.seen ?? trip.reported
  if (seen === undefined || seen >= fetched || calls.length !== path.stops.length)
    return trip.progress
  return progressAt(timelineOf(calls, path), seen, path.length)
}

/** Where a trip on the map is at `now`, in the terms its panel says it. */
export function whereOf(input: WhereInput): Where {
  const { trip, state, fetched, path, now } = input
  if (trip.waiting) return { kind: 'waiting', stop: 0, departs: trip.next[0]?.time ?? now }
  if (state === 'no-signal') return { kind: 'near', stop: nearest(path, lastSeenAt(input)) }
  const progress = progressAt(motionOf(trip, fetched, path).timeline, now, path.length)
  const stop = nearest(path, progress)
  if (Math.abs(path.stops[stop] - progress) <= AT_STOP) return { kind: 'at', stop }
  const from = progress > path.stops[stop] ? stop : stop - 1
  return { kind: 'between', from, to: from + 1 }
}
