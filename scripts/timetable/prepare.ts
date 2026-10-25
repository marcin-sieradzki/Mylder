import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { addDays, weekday } from '../../src/timetable/dates.ts'
import {
  COPENHAGEN_BOX,
  type Box,
  type IsoDate,
  type Manifest,
} from '../../src/timetable/format.ts'
import { readFeed, readShapes, type Service } from './feed.ts'
import { buildPatterns } from './patterns.ts'
import { buildStops } from './stops.ts'

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

  const files = {
    stops: `${version}/stops.json`,
    patterns: `${version}/patterns.json`,
    paths: `${version}/paths.json`,
  }
  const manifest: Manifest = {
    version,
    sourceHash: options.sourceHash,
    preparedDate: options.preparedDate,
    window: serviceWindow(feed.services.values()),
    timezone: feed.timezone,
    box,
    counts: {
      stops: stops.file.stops.length,
      platforms: stops.file.platforms.length,
      lines: patterns.patterns.lines.length,
      patterns: patterns.patterns.patterns.length,
      segments: patterns.paths.segments.length,
    },
    files,
  }

  await write(join(options.out, files.stops), stops.file)
  await write(join(options.out, files.patterns), patterns.patterns)
  await write(join(options.out, files.paths), patterns.paths)
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

/** Every day a service runs, from its weekdays between its dates and its added days. */
export function* runningDays(service: Service): Generator<IsoDate> {
  if (service.start) {
    for (let day = service.start; day <= service.end; day = addDays(day, 1)) {
      if (service.weekdays[weekday(day)] && !service.removed.has(day)) yield day
    }
  }
  for (const day of service.added) if (!service.removed.has(day)) yield day
}

async function write(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value))
}
