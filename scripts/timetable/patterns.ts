import { createHash } from 'node:crypto'
import {
  MODES,
  type LineRecord,
  type PathsFile,
  type PatternRecord,
  type PatternsFile,
} from '../../src/timetable/format.ts'
import { encodePolyline } from '../../src/timetable/polyline.ts'
import { lineColour } from './colours.ts'
import type { Feed, Trip } from './feed.ts'
import { cutAtStops, distanceToLine, fromXY, simplify, toXY, type XY } from './geo.ts'
import type { PreparedStops } from './stops.ts'

/** How far a path may stray from the trips' shape: about 5 m, less the rounding to 5 decimals. */
const SIMPLIFY_METRES = 4
/** Two patterns' paths between the same platforms are one segment when this close. */
const SHARE_METRES = 5

export interface PreparedPatterns {
  readonly file: PatternsFile
  readonly paths: PathsFile
  /** Each kept trip's pattern, as its index in `file.patterns`. */
  readonly patternOf: ReadonlyMap<Trip, number>
  /** Patterns whose trips have no shape, so no path. */
  readonly withoutShape: readonly string[]
}

/**
 * One Pattern per line, direction and ordered stop sequence, each with its path from its trips'
 * shape, simplified, cut at each stop, and shared stop to stop with other patterns.
 */
export function buildPatterns(
  feed: Feed,
  stops: PreparedStops,
  log: (message: string) => void,
): PreparedPatterns {
  const lineKey = (trip: Trip) => `${trip.route.mode}|${trip.route.line}`

  // Group trips by line, direction and stop sequence.
  const groups = new Map<string, Trip[]>()
  for (const trip of feed.trips) {
    const sequence = trip.calls.map((c) => c.stop.gtfsId).join(',')
    const key = `${lineKey(trip)}|${trip.direction}|${sequence}`
    const group = groups.get(key)
    if (group) group.push(trip)
    else groups.set(key, [trip])
  }

  // Lines in mode order, then by name as people read them: 1A before 2A before 10.
  const byName = new Intl.Collator('da', { numeric: true }).compare
  const lineTrips = [...new Map(feed.trips.map((t) => [lineKey(t), t])).values()].sort(
    (a, b) =>
      MODES.indexOf(a.route.mode) - MODES.indexOf(b.route.mode) ||
      byName(a.route.line, b.route.line),
  )
  const lineIndex = new Map(lineTrips.map((t, i) => [lineKey(t), i]))
  const fallbacks = new Map<string, string[]>()
  const lines: LineRecord[] = lineTrips.map(({ route }) => {
    const { colour, fallback } = lineColour(route.mode, route.line)
    if (fallback) fallbacks.set(colour, [...(fallbacks.get(colour) ?? []), route.line])
    return { name: route.line, mode: route.mode, colour }
  })
  for (const [colour, names] of fallbacks) {
    log(`No Perron line token, so ${colour}, for ${names.length} lines: ${names.join(', ')}`)
  }

  const ordered = [...groups.values()]
    .map((trips) => {
      const first = trips[0]
      const platformIds = first.calls.map((c) => c.stop.gtfsId)
      const key = createHash('sha256')
        .update(`${lineKey(first)}|${first.direction}|${platformIds.join(',')}`)
        .digest('hex')
        .slice(0, 10)
      return { trips, key, line: lineIndex.get(lineKey(first))! }
    })
    .sort((a, b) => a.line - b.line || a.key.localeCompare(b.key))

  const segments: string[] = []
  const segmentPoints: XY[][] = []
  const segmentsBetween = new Map<string, number[]>()
  /** Where a platform meets the paths: the first pattern to reach it sets the point. */
  const anchors = new Map<number, XY>()
  const withoutShape: string[] = []
  const patternOf = new Map<Trip, number>()

  const patterns: PatternRecord[] = ordered.map(({ trips, key, line }, index) => {
    const first = trips[0]
    const platformIndexes = first.calls.map((c) => stops.platformIndex.get(c.stop.gtfsId)!)
    const platformXY = first.calls.map((c) => toXY(c.stop.lat, c.stop.lon))
    for (const trip of trips) patternOf.set(trip, index)

    const shape = feed.shapes.get(mostCommon(trips.map((t) => t.shapeId)))
    let pieces: XY[][]
    if (shape && shape.length >= 2) {
      const shapeXY = shape.map(([lat, lon]) => toXY(lat, lon))
      const cuts = cutAtStops(shapeXY, platformXY)
      pieces = cuts.slice(1).map((to, i) => {
        const from = cuts[i]
        return [from.point, ...shapeXY.slice(from.leg + 1, to.leg + 1), to.point]
      })
      cuts.forEach((cut, i) => {
        if (!anchors.has(platformIndexes[i])) anchors.set(platformIndexes[i], cut.point)
      })
    } else {
      withoutShape.push(`${first.route.line} ${first.headsign} (${key})`)
      pieces = platformXY.slice(1).map((to, i) => [platformXY[i], to])
      platformXY.forEach((xy, i) => {
        if (!anchors.has(platformIndexes[i])) anchors.set(platformIndexes[i], xy)
      })
    }

    const patternSegments = pieces.map((piece, i) => {
      const from = platformIndexes[i]
      const to = platformIndexes[i + 1]
      const raw = [anchors.get(from)!, ...piece.slice(1, -1), anchors.get(to)!]
      const pair = `${from}-${to}`
      const candidates = segmentsBetween.get(pair) ?? []
      const shared = candidates.find((s) => alongside(raw, segmentPoints[s]))
      if (shared !== undefined) return shared
      const points = simplify(raw, SIMPLIFY_METRES).map(fromXY)
      segments.push(encodePolyline(points))
      segmentPoints.push(points.map(([lat, lon]) => toXY(lat, lon)))
      segmentsBetween.set(pair, [...candidates, segments.length - 1])
      return segments.length - 1
    })

    return {
      key,
      line,
      direction: Number(first.direction) || 0,
      headsign: mostCommon(trips.map((t) => t.headsign)),
      stops: platformIndexes,
      segments: patternSegments,
    }
  })

  return { file: { lines, patterns }, paths: { segments }, patternOf, withoutShape }
}

/** Whether two lines stay within SHARE_METRES of each other along their whole length. */
function alongside(a: readonly XY[], b: readonly XY[]): boolean {
  return (
    a.every((p) => distanceToLine(p, b) <= SHARE_METRES) &&
    b.every((p) => distanceToLine(p, a) <= SHARE_METRES)
  )
}

function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>()
  let best = values[0]
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (count > counts.get(best)!) best = value
  }
  return best
}
