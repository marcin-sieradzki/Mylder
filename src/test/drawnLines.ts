import type { FeatureCollection, MultiLineString } from 'geojson'
import type { GeoJSONSourceSpecification, StyleSpecification } from 'maplibre-gl'
import { expect } from 'vitest'
import type { Network } from '../timetable/network.ts'

// The basemap's lines as a style draws them, for tests of where a line's strand lies: its pieces,
// the segments they are and the offsets they are drawn at.

/** The features of one of a style's GeoJSON sources. */
export const features = (style: StyleSpecification, source: string) => {
  const data = (style.sources[source] as GeoJSONSourceSpecification).data
  return (data as FeatureCollection).features
}

/** Each drawn piece of a line's path: the segment it is, and the offset it is drawn at. */
export function drawnOf(style: StyleSpecification, on: Network, name: string) {
  const segmentAt = new Map<string, number>()
  on.paths.segments.forEach((_, segment) => {
    const points = on.paths.points(segment).map(([lat, lon]) => [lon, lat])
    segmentAt.set(JSON.stringify([points[0], points.at(-1)]), segment)
  })
  return features(style, 'mylder-lines')
    .filter((f) => f.properties!.line === name)
    .flatMap((f) =>
      (f.geometry as MultiLineString).coordinates.map((piece) => ({
        offset: f.properties!.offset as number,
        segment: segmentAt.get(JSON.stringify([piece[0], piece.at(-1)]))!,
      })),
    )
}

/** Which way a line's patterns run a segment: 1 along the line's direction 0, -1 against. */
export function wayOf(on: Network, name: string, segment: number) {
  const line = on.patterns.lines.findIndex((each) => each.name === name)
  const ways = on.patterns.patterns
    .filter((pattern) => pattern.line === line && pattern.segments.includes(segment))
    .map((pattern) => (pattern.direction === 0 ? 1 : -1))
  expect(new Set(ways).size).toBe(1)
  return ways[0]
}

/**
 * The sides of the track a line is drawn on off its centre, facing its direction 0: 1 for the
 * right, -1 for the left.
 */
export const sidesOf = (style: StyleSpecification, on: Network, name: string) =>
  new Set(
    drawnOf(style, on, name)
      .filter(({ offset }) => offset !== 0)
      .map(({ offset, segment }) => Math.sign(offset) * wayOf(on, name, segment)),
  )
