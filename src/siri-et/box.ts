// The box the reader lists journeys by (spec #146): the stops and platforms of one timetable
// version inside its box, from its manifest and stops file, whether read from a folder, as a
// recording's are, or fetched from the app's timetable routes, as the listener's are.
import type { Box } from '../timetable/format.ts'
import { readManifest } from '../timetable/manifest.ts'
import { platformId, readStops } from '../timetable/stops.ts'
import type { ReaderBox } from './reader.ts'

/** The stops file a manifest names, by the name the app's timetable route serves it under. */
export const stopsFileOf = (manifest: unknown): string => readManifest(manifest).files.stops

/** The stops and platforms of a timetable inside a box, the timetable's own unless another is given. */
export function boxOf(manifest: unknown, stopsFile: unknown, area?: Box): ReaderBox {
  const read = readManifest(manifest)
  const { stops, platforms } = readStops(stopsFile)
  const { south, west, north, east } = area ?? read.box
  const inside = [...stops, ...platforms].filter(
    ({ lat, lon }) => lat >= south && lat <= north && lon >= west && lon <= east,
  )
  return {
    stops: new Set(inside.map(({ id }) => platformId(id))),
    timetableVersion: read.version,
    timezone: read.timezone,
  }
}
