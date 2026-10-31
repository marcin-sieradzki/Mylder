// Where a dot is drawn beside its track's centre: on its line's strand, as Perron's map foundation
// gives it ("Lines and dots"), at the strand's offset on the step of its pattern it is on, square
// to the way it runs there. MapLibre draws each strand on the ground, its `line-offset` in px at
// the camera's zoom (ADR 0016), so the dot's offset is measured there too: the strand's px as
// metres on the ground at that zoom, to the right of the piece of path the dot is on, then drawn
// through the map's camera, so it holds however the map is turned or tilted. The loop writes it
// each frame with the position, and looks each step up by halving.
import 'client-only'
import type { MeasuredPath } from '../domain/trip-motion.ts'
import type { Project } from './picking.ts'
import type { Vehicles } from './vehicles.ts'

/** How the map's camera draws the ground now. */
export interface Projection {
  /** Where a longitude and latitude are drawn, in px from the canvas's top left. */
  readonly project: Project
  /** The camera's zoom, at which a strand's px are measured on the ground. */
  readonly zoom: number
}

/** The Earth's radius in metres, as Web Mercator takes it. */
const EARTH_RADIUS = 6_378_137
/** The width of MapLibre's world at zoom 0, in px: one 512 px tile. */
const WORLD = 512
const DEGREES = 180 / Math.PI

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
 * Writes the `i`th vehicle's offset for a dot `along` metres along its `path`, standing at its
 * position: its strand on the step it is on, which starts at a stop at or behind it, laid on the
 * ground to the right of the piece of path it is on and drawn by `projection`, in px across the
 * canvas to the right and up it.
 */
export function writeOffset(
  vehicles: Vehicles,
  i: number,
  path: MeasuredPath,
  along: number,
  projection: Projection,
) {
  const { offsets, positions } = vehicles
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
  // The strand's px as metres on the ground at the dot, at the camera's zoom.
  const lon = positions[i * 2]
  const lat = positions[i * 2 + 1]
  const cos = Math.cos((lat * Math.PI) / 180)
  const metres = (place * 2 * Math.PI * EARTH_RADIUS * cos) / (WORLD * 2 ** projection.zoom)
  // Facing (east, north), the right is (north, −east): the point that far to the right.
  const right = [
    lon + ((metres * north) / length / (EARTH_RADIUS * cos)) * DEGREES,
    lat + ((-metres * east) / length / EARTH_RADIUS) * DEGREES,
  ] as [number, number]
  const at = projection.project([lon, lat])
  const off = projection.project(right)
  offsets[i * 2] = off.x - at.x
  offsets[i * 2 + 1] = at.y - off.y
}
