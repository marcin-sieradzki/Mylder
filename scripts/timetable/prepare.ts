import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  COPENHAGEN_BOX,
  type Box,
  type IsoDate,
  type Manifest,
} from '../../src/timetable/format.ts'
import { readFeed, readShapes, runningDays, type Service } from './feed.ts'
import { buildPatterns } from './patterns.ts'
import { readTrips } from '../../src/timetable/trips.ts'
import { buildStops } from './stops.ts'
import { buildDayProfiles, buildTrips } from './trips.ts'

export interface PrepareOptions {
  /** An unzipped GTFS folder. */
  readonly gtfs: string
  /** Where the manifest and the version's folder are written. */
  readonly out: string
  /** The SHA-256 of the downloaded zip, which names the version and spots an unchanged feed. */
  readonly sourceHash: string
  readonly preparedDate: IsoDate
  readonly box?: Box
  readonly log?: (message: string) => void
}

/** Prepares the timetable from a GTFS folder and writes its files. */
export async function prepareTimetable(options: PrepareOptions): Promise<Manifest> {
  const box = options.box ?? COPENHAGEN_BOX
  const version = `${options.preparedDate}-${options.sourceHash.slice(0, 8)}`
  const feed = await readFeed(options.gtfs, box)
  const log = options.log ?? (() => {})
  const stops = buildStops(feed)
  const shapes = await readShapes(options.gtfs, new Set(feed.trips.map((t) => t.shapeId)))
  const patterns = buildPatterns(feed, stops, shapes, log)
  const window = serviceWindow(feed.services.values())
  const trips = buildTrips(feed, patterns.patternOf, window)
  const dayProfiles = buildDayProfiles(readTrips(trips), window, feed.timezone)

  const files = {
    stops: `${version}/stops.json`,
    patterns: `${version}/patterns.json`,
    paths: `${version}/paths.json`,
    trips: `${version}/trips.json`,
    dayProfiles: `${version}/day-profiles.json`,
  }
  const manifest: Manifest = {
    version,
    sourceHash: options.sourceHash,
    preparedDate: options.preparedDate,
    window,
    timezone: feed.timezone,
    box,
    counts: {
      stops: stops.file.stops.length,
      platforms: stops.file.platforms.length,
      lines: patterns.patterns.lines.length,
      patterns: patterns.patterns.patterns.length,
      segments: patterns.paths.segments.length,
      trips: trips.trips.pattern.length,
      profiles: trips.profiles.length,
      services: trips.services.length,
    },
    files,
  }

  await write(join(options.out, files.stops), stops.file)
  await write(join(options.out, files.patterns), patterns.patterns)
  await write(join(options.out, files.paths), patterns.paths)
  await write(join(options.out, files.trips), trips)
  await write(join(options.out, files.dayProfiles), dayProfiles)
  await write(join(options.out, 'manifest.json'), manifest)
  return manifest
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
