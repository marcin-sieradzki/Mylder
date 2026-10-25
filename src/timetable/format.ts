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

export interface Manifest {
  readonly version: string
  readonly sourceHash: string
  readonly preparedDate: IsoDate
  /** The first and last service days the trips cover. */
  readonly window: { readonly first: IsoDate; readonly last: IsoDate }
  readonly timezone: string
  readonly box: Box
  readonly counts: {
    readonly stops: number
    readonly platforms: number
  }
  /** Each file's name, relative to the manifest. */
  readonly files: {
    readonly stops: string
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
