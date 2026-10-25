import { measurePath, type MeasuredPath } from '../domain/trip-motion.ts'
import type { PathsFile, PatternRecord } from './format.ts'
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

/**
 * A pattern's path, measured for moving trips along it: its segments joined in calling order,
 * with each stop's distance along it.
 */
export function patternPath(pattern: Pick<PatternRecord, 'segments'>, paths: Paths): MeasuredPath {
  return measurePath(pattern.segments.map((segment) => paths.points(segment)))
}
