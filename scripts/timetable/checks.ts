import { addDays, daysBetween } from '../../src/timetable/dates.ts'
import type { IsoDate, Manifest, TripsFile } from '../../src/timetable/format.ts'
import { runsOn } from '../../src/timetable/trips.ts'
import type { PreparedStops } from './stops.ts'
import type { PreparedPatterns } from './patterns.ts'
import { GTFS_FILES, type Feed } from './feed.ts'

// The job's checks, so a half-written or shrunken release never reaches the map. A failed check
// throws before anything is written.

/** How many days ahead of the prepared date the timetable must reach. */
export const DAYS_AHEAD = 14

export class TimetableCheckError extends Error {
  override name = 'TimetableCheckError'
}

function fail(side: 'Input' | 'Output', message: string): never {
  throw new TimetableCheckError(`${side} check failed: ${message}`)
}

/** Whether `now` is within a third of `before`. */
function withinAThird(now: number, before: number): boolean {
  return Math.abs(now - before) <= before / 3
}

export function checkFiles(present: readonly string[]): void {
  const missing = GTFS_FILES.filter((file) => !present.includes(file))
  if (missing.length > 0) fail('Input', `the feed has no ${missing.join(', ')}`)
}

export function checkInput(feed: Feed, preparedDate: IsoDate, previous?: Manifest): void {
  const needed = addDays(preparedDate, DAYS_AHEAD)
  if (feed.calendarEnd < needed) {
    fail(
      'Input',
      `the calendar runs to ${feed.calendarEnd || 'no day'}, short of ${DAYS_AHEAD} days ahead (${needed})`,
    )
  }
  if (!previous) return
  for (const file of GTFS_FILES) {
    const now = feed.rows[file] ?? 0
    const before = previous.sourceRows[file]
    if (before !== undefined && !withinAThird(now, before)) {
      fail('Input', `${file} has ${now} rows, against ${before} in ${previous.version}`)
    }
  }
}

export function tripsOn(trips: TripsFile, day: IsoDate): number {
  const index = daysBetween(trips.first, day)
  return trips.trips.service.filter((_, t) => runsOn(trips, t, index)).length
}

export function checkOutput(
  result: {
    readonly stops: PreparedStops
    readonly patterns: PreparedPatterns
    readonly trips: TripsFile
    readonly manifest: Manifest
  },
  previous?: Manifest,
): void {
  const { stops, patterns, trips, manifest } = result
  const patternCount = patterns.file.patterns.length
  const missingPattern = trips.trips.pattern.filter((p) => !(p >= 0 && p < patternCount)).length
  if (missingPattern > 0) fail('Output', `${missingPattern} trips have no pattern`)

  if (patterns.withoutShape.length > 0) {
    fail('Output', `no path for ${patterns.withoutShape.join('; ')}, whose trips have no shape`)
  }
  for (const pattern of patterns.file.patterns) {
    const line = patterns.file.lines[pattern.line].name
    if (pattern.stops.length < 2) fail('Output', `a pattern of ${line} has fewer than two stops`)
    if (pattern.segments.length !== pattern.stops.length - 1) {
      fail('Output', `a pattern of ${line} has no path between some of its stops`)
    }
  }
  const untimed = trips.profiles.filter((p) => p.some((step) => !Number.isFinite(step))).length
  if (untimed > 0) fail('Output', `${untimed} run profiles have calls without a time`)

  const unplaced = [...stops.file.stops, ...stops.file.platforms].filter(
    (s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || (s.lat === 0 && s.lon === 0),
  )
  if (unplaced.length > 0) {
    fail('Output', `no position for ${unplaced.map((s) => `${s.name} (${s.id})`).join(', ')}`)
  }

  const needed = addDays(manifest.preparedDate, DAYS_AHEAD)
  if (manifest.window.last < needed) {
    fail('Output', `the trips run to ${manifest.window.last}, short of ${DAYS_AHEAD} days ahead`)
  }
  const { comparisonDayTrips } = manifest.counts
  if (previous && !withinAThird(comparisonDayTrips, previous.counts.comparisonDayTrips)) {
    fail(
      'Output',
      `${manifest.comparisonDay} has ${comparisonDayTrips} trips, against ` +
        `${previous.counts.comparisonDayTrips} on ${previous.comparisonDay} in ${previous.version}`,
    )
  }
}
