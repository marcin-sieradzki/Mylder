// The prepared timetable as the tracker holds it: read once per instance from the files the
// deployment carries (docs/timetable.md, "How they are served and loaded"), the network through
// the reader the browser shares, and each service day expanded on first use, then kept.
import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addDays } from '../timetable/dates.ts'
import type { IsoDate } from '../timetable/format.ts'
import { readManifest } from '../timetable/manifest.ts'
import { readNetwork, type Network, type NetworkFiles } from '../timetable/network.ts'
import { expandServiceDay, readTrips, type PlannedTrip } from '../timetable/trips.ts'

/** Where the deployment keeps the prepared files. */
export const TIMETABLE_DIR = join(process.cwd(), 'public', 'timetable')

/** The network (src/timetable/network.ts), with the trips of each service day. */
export interface Timetable extends Network {
  /** Every trip of a service day, with its calls' planned times. */
  tripsOn(day: IsoDate): readonly PlannedTrip[]
  /**
   * The service days whose trips may be running at a moment: the calendar day in the
   * timetable's zone, and the one before, whose late trips run past midnight.
   */
  serviceDaysAt(now: number): readonly IsoDate[]
}

/** The prepared files, parsed or not, by what they hold. */
export interface TimetableFiles extends NetworkFiles {
  readonly trips: unknown
}

export function timetableFrom(files: TimetableFiles): Timetable {
  const network = readNetwork(files)
  const { manifest, patterns } = network
  const trips = readTrips(files.trips)
  const days = new Map<IsoDate, readonly PlannedTrip[]>()
  const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: manifest.timezone })
  return {
    ...network,
    tripsOn(day) {
      let planned = days.get(day)
      if (!planned) {
        planned = expandServiceDay(trips, patterns, day, manifest.timezone)
        days.set(day, planned)
      }
      return planned
    },
    serviceDaysAt(now) {
      const today = calendar.format(now)
      return [addDays(today, -1), today]
    },
  }
}

/** Reads one of a timetable folder's files by its name in the manifest, as text. */
export type ReadTimetableFile = (file: string) => Promise<string>

/** The reader of a folder on disk. */
export const filesIn =
  (dir: string): ReadTimetableFile =>
  (file) =>
    readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, file), 'utf8')

/** Reads a timetable: the manifest, then the files it names. */
export async function readTimetable(read: ReadTimetableFile): Promise<Timetable> {
  const json = async (name: string): Promise<unknown> => JSON.parse(await read(name))
  const manifest = readManifest(await json('manifest.json'))
  const { files } = manifest
  const [stops, patterns, paths, trips] = await Promise.all(
    [files.stops, files.patterns, files.paths, files.trips].map(json),
  )
  return timetableFrom({ manifest, stops, patterns, paths, trips })
}

/** Reads the deployed timetable, or the one in `dir`. */
export const loadTimetable = (dir: string = TIMETABLE_DIR): Promise<Timetable> =>
  // The files reach the deployment through `outputFileTracingIncludes`, so the build needn't trace
  // this read, which would otherwise pull in the whole project.
  readTimetable(filesIn(dir))

/**
 * The files the browser loads, by the names its route takes: the network, and the day profiles
 * City pulse draws; never the trips.
 */
export const BROWSER_FILES = ['manifest', 'stops', 'patterns', 'paths', 'dayProfiles'] as const

export type BrowserFileName = (typeof BROWSER_FILES)[number]

export const isBrowserFile = (name: string): name is BrowserFileName =>
  (BROWSER_FILES as readonly string[]).includes(name)

/** The current manifest as it is stored. */
export const readManifestFile = (read: ReadTimetableFile): Promise<string> => read('manifest.json')

/**
 * One of the files the browser loads, as it is stored, or undefined when the folder holds
 * another version.
 */
export async function readBrowserFile(
  read: ReadTimetableFile,
  version: string,
  name: BrowserFileName,
): Promise<string | undefined> {
  const manifestText = await readManifestFile(read)
  const manifest = readManifest(JSON.parse(manifestText))
  if (manifest.version !== version) return undefined
  return name === 'manifest' ? manifestText : read(manifest.files[name])
}
