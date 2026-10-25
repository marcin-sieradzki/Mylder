// The prepared timetable as the tracker holds it: read once per instance from the files the
// deployment carries (docs/timetable.md, "How they are served and loaded"), each service day
// expanded and each pattern's path measured on first use, then kept.
import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MeasuredPath } from '../domain/trip-motion.ts'
import { addDays } from '../timetable/dates.ts'
import type { IsoDate, Manifest, PatternsFile } from '../timetable/format.ts'
import { readManifest } from '../timetable/manifest.ts'
import { patternPath, readPaths, type Paths } from '../timetable/paths.ts'
import { readPatterns } from '../timetable/patterns.ts'
import { readStops, type Stops } from '../timetable/stops.ts'
import { expandServiceDay, readTrips, type PlannedTrip } from '../timetable/trips.ts'

/** Where the deployment keeps the prepared files. */
export const TIMETABLE_DIR = join(process.cwd(), 'public', 'timetable')

export interface Timetable {
  readonly manifest: Manifest
  readonly stops: Stops
  readonly patterns: PatternsFile
  readonly paths: Paths
  /** Every trip of a service day, with its calls' planned times. */
  tripsOn(day: IsoDate): readonly PlannedTrip[]
  /** A pattern's path, measured. */
  pathOf(pattern: number): MeasuredPath
  /**
   * The service days whose trips may be running at a moment: the calendar day in the
   * timetable's zone, and the one before, whose late trips run past midnight.
   */
  serviceDaysAt(now: number): readonly IsoDate[]
}

/** The prepared files, parsed or not, by what they hold. */
export interface TimetableFiles {
  readonly manifest: unknown
  readonly stops: unknown
  readonly patterns: unknown
  readonly paths: unknown
  readonly trips: unknown
}

export function timetableFrom(files: TimetableFiles): Timetable {
  const manifest = readManifest(files.manifest)
  const stops = readStops(files.stops)
  const patterns = readPatterns(files.patterns)
  const paths = readPaths(files.paths)
  const trips = readTrips(files.trips)
  const days = new Map<IsoDate, readonly PlannedTrip[]>()
  const measured = new Map<number, MeasuredPath>()
  const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: manifest.timezone })
  return {
    manifest,
    stops,
    patterns,
    paths,
    tripsOn(day) {
      let planned = days.get(day)
      if (!planned) {
        planned = expandServiceDay(trips, patterns, day, manifest.timezone)
        days.set(day, planned)
      }
      return planned
    },
    pathOf(pattern) {
      let path = measured.get(pattern)
      if (!path) {
        path = patternPath(patterns.patterns[pattern], paths)
        measured.set(pattern, path)
      }
      return path
    },
    serviceDaysAt(now) {
      const today = calendar.format(now)
      return [addDays(today, -1), today]
    },
  }
}

/** Reads the deployed timetable: the manifest, then the files it names. */
export async function loadTimetable(dir: string = TIMETABLE_DIR): Promise<Timetable> {
  const json = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(join(dir, name), 'utf8'))
  const manifest = readManifest(await json('manifest.json'))
  const { files } = manifest
  const [stops, patterns, paths, trips] = await Promise.all(
    [files.stops, files.patterns, files.paths, files.trips].map(json),
  )
  return timetableFrom({ manifest, stops, patterns, paths, trips })
}
