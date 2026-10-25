import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tuesdayFrom } from '../../src/timetable/dates.ts'
import {
  COPENHAGEN_BOX,
  FORMAT,
  type Box,
  type IsoDate,
  type Manifest,
} from '../../src/timetable/format.ts'
import { readManifest } from '../../src/timetable/manifest.ts'
import { readTrips } from '../../src/timetable/trips.ts'
import { checkFiles, checkInput, checkOutput, tripsOn } from './checks.ts'
import { readFeed, runningDays, type Service } from './feed.ts'
import { buildPatterns } from './patterns.ts'
import { buildStops } from './stops.ts'
import { buildDayProfiles, buildTrips } from './trips.ts'

/** A version folder's name: the prepared date and the start of the source hash. */
const VERSION = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/

export interface PrepareOptions {
  /** An unzipped GTFS folder. */
  readonly gtfs: string
  /** Where the manifest and the version's folder are written; it may hold the last release. */
  readonly out: string
  /** The SHA-256 of the downloaded zip, which names the version and spots an unchanged feed. */
  readonly sourceHash: string
  readonly preparedDate: IsoDate
  readonly box?: Box
  /** Prepare the feed even when it is the one the last release was prepared from. */
  readonly force?: boolean
  readonly log?: (message: string) => void
}

export type PrepareResult =
  /** The feed is the one the last release was prepared from; nothing was written. */
  | { readonly changed: false; readonly manifest: Manifest }
  | { readonly changed: true; readonly manifest: Manifest }

/**
 * Prepares the timetable from a GTFS folder and writes its files over the last release's. A
 * failed check throws a TimetableCheckError and writes nothing.
 */
export async function prepareTimetable(options: PrepareOptions): Promise<PrepareResult> {
  const log = options.log ?? (() => {})
  const box = options.box ?? COPENHAGEN_BOX
  const previous = await readPrevious(options.out)
  const unchanged = previous?.sourceHash === options.sourceHash && previous.format === FORMAT
  if (previous && unchanged && !options.force) return { changed: false, manifest: previous }

  checkFiles(await readdir(options.gtfs))
  const feed = await readFeed(options.gtfs, box)
  checkInput(feed, options.preparedDate, previous)

  const version = `${options.preparedDate}-${options.sourceHash.slice(0, 8)}`
  const stops = buildStops(feed)
  const patterns = buildPatterns(feed, stops, log)
  const window = serviceWindow(feed.services.values())
  const trips = buildTrips(feed, patterns.patternOf, window)
  const dayProfiles = buildDayProfiles(readTrips(trips), window, feed.timezone)
  const comparisonDay = tuesdayFrom(
    options.preparedDate > window.first ? options.preparedDate : window.first,
  )

  const files = {
    stops: `${version}/stops.json`,
    patterns: `${version}/patterns.json`,
    paths: `${version}/paths.json`,
    trips: `${version}/trips.json`,
    dayProfiles: `${version}/day-profiles.json`,
  }
  const manifest: Manifest = {
    format: FORMAT,
    version,
    sourceHash: options.sourceHash,
    preparedDate: options.preparedDate,
    window,
    timezone: feed.timezone,
    box,
    sourceRows: feed.rows,
    comparisonDay,
    counts: {
      stops: stops.file.stops.length,
      platforms: stops.file.platforms.length,
      lines: patterns.file.lines.length,
      patterns: patterns.file.patterns.length,
      segments: patterns.paths.segments.length,
      trips: trips.trips.pattern.length,
      profiles: trips.profiles.length,
      services: trips.services.length,
      comparisonDayTrips: tripsOn(trips, comparisonDay),
    },
    files,
  }
  checkOutput({ stops, patterns, trips, manifest }, previous)

  // The new version's files first and the manifest that names them last, then older versions go.
  await write(join(options.out, files.stops), stops.file)
  await write(join(options.out, files.patterns), patterns.file)
  await write(join(options.out, files.paths), patterns.paths)
  await write(join(options.out, files.trips), trips)
  await write(join(options.out, files.dayProfiles), dayProfiles)
  await write(join(options.out, 'manifest.json'), manifest)
  for (const entry of await readdir(options.out)) {
    if (entry !== version && VERSION.test(entry)) {
      await rm(join(options.out, entry), { recursive: true, force: true })
    }
  }
  return { changed: true, manifest }
}

async function readPrevious(out: string): Promise<Manifest | undefined> {
  const path = join(out, 'manifest.json')
  try {
    await access(path)
  } catch {
    return undefined
  }
  return readManifest(JSON.parse(await readFile(path, 'utf8')))
}

/** The first and last days any of the services runs. */
function serviceWindow(services: Iterable<Service>): Manifest['window'] {
  let first = ''
  let last = ''
  for (const service of services) {
    for (const day of runningDays(service)) {
      if (!first || day < first) first = day
      if (!last || day > last) last = day
    }
  }
  return { first, last }
}

async function write(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value))
}
