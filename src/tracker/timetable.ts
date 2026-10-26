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

/** Reads the deployed timetable: the manifest, then the files it names. */
export async function loadTimetable(dir: string = TIMETABLE_DIR): Promise<Timetable> {
  // The files reach the deployment through `outputFileTracingIncludes`, so the build needn't trace
  // this read, which would otherwise pull in the whole project.
  const json = async (name: string): Promise<unknown> =>
    JSON.parse(
      await readFile(
        /* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, name),
        'utf8',
      ),
    )
  const manifest = readManifest(await json('manifest.json'))
  const { files } = manifest
  const [stops, patterns, paths, trips] = await Promise.all(
    [files.stops, files.patterns, files.paths, files.trips].map(json),
  )
  return timetableFrom({ manifest, stops, patterns, paths, trips })
}
