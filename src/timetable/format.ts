// The prepared timetable's files, as the timetable job writes them and the readers parse them.
// Plain TypeScript with no imports, so the job, the server and the browser share one shape.
// The files are described in docs/timetable.md.

export type Mode = 'bus' | 'metro' | 's-tog' | 'train' | 'light-rail'

export const MODES: readonly Mode[] = ['bus', 'metro', 's-tog', 'train', 'light-rail']

export interface Box {
  readonly south: number
  readonly west: number
  readonly north: number
  readonly east: number
}

/** The position poll's box (docs/live-data.md): the whole S-tog network, Helsingør, Roskilde. */
export const COPENHAGEN_BOX: Box = { south: 55.45, west: 12.05, north: 56.05, east: 12.7 }

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string

/**
 * The files' format. The job writes it into the manifest and prepares an unchanged feed again
 * when it differs, so a change to the format reaches the deployed files on the next run.
 */
export const FORMAT = 1

export interface Manifest {
  readonly format: number
  readonly version: string
  readonly sourceHash: string
  readonly preparedDate: IsoDate
  /** The first and last service days the trips cover. */
  readonly window: { readonly first: IsoDate; readonly last: IsoDate }
  readonly timezone: string
  readonly box: Box
  /** Each GTFS file's row count, before the cut, for the next release's input checks. */
  readonly sourceRows: Readonly<Record<string, number>>
  /** The first Tuesday from the prepared date, whose trips the next release's checks compare. */
  readonly comparisonDay: IsoDate
  readonly counts: {
    readonly stops: number
    readonly platforms: number
    readonly lines: number
    readonly patterns: number
    readonly segments: number
    readonly trips: number
    readonly profiles: number
    readonly services: number
    /** The trips that run on `comparisonDay`. */
    readonly comparisonDayTrips: number
  }
  /** Each file's name, relative to the manifest. */
  readonly files: {
    readonly stops: string
    readonly patterns: string
    readonly paths: string
    readonly trips: string
    readonly dayProfiles: string
  }
}

/**
 * Stops as places. A Stop groups the GTFS rows passengers think of as one place; each row is a
 * Platform. Patterns refer to platforms by their index in `platforms`.
 */
export interface StopsFile {
  readonly stops: readonly StopRecord[]
  readonly platforms: readonly PlatformRecord[]
}

export interface StopRecord {
  /** Mylder's id for the place: the smallest platform id it holds. */
  readonly id: string
  readonly name: string
  readonly lat: number
  readonly lon: number
  readonly modes: readonly Mode[]
}

export interface PlatformRecord {
  /** The GTFS stop id without its leading zeros, as the API writes it: `8600626`. */
  readonly id: string
  /** The index of its Stop in `stops`. */
  readonly stop: number
  readonly name: string
  readonly lat: number
  readonly lon: number
}

/** Lines and the patterns their trips follow. */
export interface PatternsFile {
  readonly lines: readonly LineRecord[]
  readonly patterns: readonly PatternRecord[]
}

export interface LineRecord {
  /** The public name, such as `5C`, `M2` or `A`. */
  readonly name: string
  readonly mode: Mode
  /** The Perron colour token the line is drawn in, such as `perron-color-transit-line-a`. */
  readonly colour: string
}

export interface PatternRecord {
  /** Built from the pattern's content, so it lasts across releases that renumber GTFS ids. */
  readonly key: string
  /** The index of its line in `lines`. */
  readonly line: number
  /** The GTFS `direction_id`, 0 or 1. */
  readonly direction: number
  readonly headsign: string
  /** Its platforms in calling order, as indexes in the stops file's `platforms`. */
  readonly stops: readonly number[]
  /** The path between each stop and the next, as indexes in the paths file's `segments`. */
  readonly segments: readonly number[]
}

/** Stop-to-stop paths, shared between the patterns that run along them. */
export interface PathsFile {
  /** Each segment as an encoded polyline at five decimals, from one stop to the next. */
  readonly segments: readonly string[]
}

/**
 * Every trip in the window, for the tracker. A trip's calls follow its pattern's stops, at its
 * first departure plus its run profile's offsets, on the days its service runs. The trips are
 * stored as columns, which gzip packs far tighter than a record per trip.
 */
export interface TripsFile {
  /** The window's first day, from which each service's days are counted. */
  readonly first: IsoDate
  /** Each service as one character per day of the window: `1` when it runs, else `0`. */
  readonly services: readonly string[]
  /**
   * Run profiles, shared by the trips that run to them: each call's arrival and departure,
   * flattened as `[arrival, departure, arrival, ...]`, each in seconds after the value before
   * it, starting from the trip's first departure.
   */
  readonly profiles: readonly (readonly number[])[]
  readonly trips: {
    /** The index of each trip's pattern in the patterns file. */
    readonly pattern: readonly number[]
    /** Seconds after the service day's noon minus twelve hours, as GTFS counts; past 24:00 for a late trip. */
    readonly departure: readonly number[]
    readonly profile: readonly number[]
    readonly service: readonly number[]
    /** The train number from `trip_short_name` for S-tog and train trips, else an empty string. */
    readonly number: readonly string[]
  }
}

/** Planned trips underway, by quarter hour of the clock, for each day of the window. */
export interface DayProfilesFile {
  readonly first: IsoDate
  /** Ninety-six counts per day (a few more or fewer on a day the clocks change), from 00:00. */
  readonly days: readonly (readonly number[])[]
}
