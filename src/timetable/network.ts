// The timetable's network: its stops, lines, patterns and their paths, without the trips. One
// reader for both sides (docs/timetable.md, "How they are served and loaded"): the browser loads
// these four files to draw the lines and move the dots, and the tracker extends it with the trips.
import type { MeasuredPath } from '../domain/trip-motion.ts'
import type { Manifest, PatternsFile } from './format.ts'
import { readManifest } from './manifest.ts'
import { patternPath, readPaths, type Paths } from './paths.ts'
import { readPatterns } from './patterns.ts'
import { readStops, type Stops } from './stops.ts'

export interface Network {
  readonly manifest: Manifest
  readonly stops: Stops
  readonly patterns: PatternsFile
  readonly paths: Paths
  /** A pattern's path, measured on first use and then kept. */
  pathOf(pattern: number): MeasuredPath
}

/** The network's files, parsed or not, by what they hold. */
export interface NetworkFiles {
  readonly manifest: unknown
  readonly stops: unknown
  readonly patterns: unknown
  readonly paths: unknown
}

/** Parses the network's files. */
export function readNetwork(files: NetworkFiles): Network {
  const patterns = readPatterns(files.patterns)
  const paths = readPaths(files.paths)
  const measured = new Map<number, MeasuredPath>()
  return {
    manifest: readManifest(files.manifest),
    stops: readStops(files.stops),
    patterns,
    paths,
    pathOf(pattern) {
      let path = measured.get(pattern)
      if (!path) {
        path = patternPath(patterns.patterns[pattern], paths)
        measured.set(pattern, path)
      }
      return path
    },
  }
}
