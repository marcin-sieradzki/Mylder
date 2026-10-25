import type { Box, Manifest } from './format.ts'
import { number, object, string } from './parse.ts'

/** Parses the manifest the timetable job writes beside the files it names. */
export function readManifest(json: unknown): Manifest {
  const m = object(json, 'manifest')
  const window = object(m.window, 'manifest.window')
  const box = object(m.box, 'manifest.box')
  const counts = object(m.counts, 'manifest.counts')
  const files = object(m.files, 'manifest.files')
  return {
    version: string(m.version, 'manifest.version'),
    sourceHash: string(m.sourceHash, 'manifest.sourceHash'),
    preparedDate: string(m.preparedDate, 'manifest.preparedDate'),
    window: {
      first: string(window.first, 'manifest.window.first'),
      last: string(window.last, 'manifest.window.last'),
    },
    timezone: string(m.timezone, 'manifest.timezone'),
    box: readBox(box),
    sourceRows: Object.fromEntries(
      Object.entries(object(m.sourceRows, 'manifest.sourceRows')).map(([file, rows]) => [
        file,
        number(rows, `manifest.sourceRows.${file}`),
      ]),
    ),
    weekday: string(m.weekday, 'manifest.weekday'),
    counts: {
      stops: number(counts.stops, 'manifest.counts.stops'),
      platforms: number(counts.platforms, 'manifest.counts.platforms'),
      lines: number(counts.lines, 'manifest.counts.lines'),
      patterns: number(counts.patterns, 'manifest.counts.patterns'),
      segments: number(counts.segments, 'manifest.counts.segments'),
      trips: number(counts.trips, 'manifest.counts.trips'),
      profiles: number(counts.profiles, 'manifest.counts.profiles'),
      services: number(counts.services, 'manifest.counts.services'),
      weekdayTrips: number(counts.weekdayTrips, 'manifest.counts.weekdayTrips'),
    },
    files: {
      stops: string(files.stops, 'manifest.files.stops'),
      patterns: string(files.patterns, 'manifest.files.patterns'),
      paths: string(files.paths, 'manifest.files.paths'),
      trips: string(files.trips, 'manifest.files.trips'),
      dayProfiles: string(files.dayProfiles, 'manifest.files.dayProfiles'),
    },
  }
}

function readBox(box: Record<string, unknown>): Box {
  return {
    south: number(box.south, 'manifest.box.south'),
    west: number(box.west, 'manifest.box.west'),
    north: number(box.north, 'manifest.box.north'),
    east: number(box.east, 'manifest.box.east'),
  }
}
