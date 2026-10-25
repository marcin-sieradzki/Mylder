import type { PathsFile } from './format.ts'
import { array, object, string } from './parse.ts'
import { decodePolyline, type LatLon } from './polyline.ts'

export interface Paths extends PathsFile {
  /** One segment's points, from its stop to the next. */
  points(segment: number): LatLon[]
}

/** Parses the paths file. Segments are decoded when asked for. */
export function readPaths(json: unknown): Paths {
  const file = object(json, 'paths file')
  const segments = array(file.segments, 'segments').map((s, i) => string(s, `segments[${i}]`))
  return { segments, points: (segment) => decodePolyline(segments[segment] ?? '') }
}
