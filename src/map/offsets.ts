// Where a dot is drawn beside its track's centre: on its line's strand, as Perron's map foundation
// gives it ("Lines and dots"), at the strand's offset on the step of its pattern it is on, square
// to the way it runs there. The loop writes it each frame with the position, so it allocates
// nothing and looks each step up by halving. The map is never rotated or pitched, so the offset
// is the same on screen as on the ground.
import 'client-only'
import type { MeasuredPath } from '../domain/trip-motion.ts'
import type { Vehicles } from './vehicles.ts'

/** The last index of `sorted` whose value is at most `value`, or 0 before the first. */
function lastAtMost(sorted: readonly number[], value: number): number {
  let low = 0
  let high = sorted.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (sorted[middle] <= value) low = middle
    else high = middle - 1
  }
  return low
}

/**
 * Writes the `i`th vehicle's offset for a dot `along` metres along its `path`: its strand on the
 * step it is on, which starts at a stop at or behind it, turned to the right of the piece of path
 * it is on, in px east and north.
 */
export function writeOffset(vehicles: Vehicles, i: number, path: MeasuredPath, along: number) {
  const { offsets } = vehicles
  const strand = vehicles.strands[i]
  const steps = strand?.length ?? 0
  const place = steps > 0 ? strand![Math.min(lastAtMost(path.stops, along), steps - 1)] : 0
  const { points, distances } = path
  if (place === 0 || points.length < 2) {
    offsets[i * 2] = 0
    offsets[i * 2 + 1] = 0
    return
  }
  // The piece the dot is on: from the last point at or behind it to the next.
  const end = Math.min(Math.max(lastAtMost(distances, along) + 1, 1), points.length - 1)
  const [lat1, lon1] = points[end - 1]
  const [lat2, lon2] = points[end]
  const east = (lon2 - lon1) * Math.cos((lat1 * Math.PI) / 180)
  const north = lat2 - lat1
  const length = Math.hypot(east, north) || 1
  // Facing (east, north), the right is (north, −east).
  offsets[i * 2] = (place * north) / length
  offsets[i * 2 + 1] = (-place * east) / length
}
