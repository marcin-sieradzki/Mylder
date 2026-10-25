import { MODES, type Mode, type PlatformRecord, type StopRecord, type StopsFile } from './format.ts'
import { array, number, object, string, TimetableFormatError } from './parse.ts'

export interface Stops extends StopsFile {
  /**
   * The Stop a platform belongs to, from its id as the GTFS writes it (`000008600626`) or as
   * the API does (`8600626`).
   */
  stopForPlatform(id: string): StopRecord | undefined
}

/** Strips a stop id's leading zeros, which the GTFS pads to twelve digits and the API drops. */
export function platformId(id: string): string {
  return id.replace(/^0+(?=.)/, '')
}

/** Parses the stops file. */
export function readStops(json: unknown): Stops {
  const file = object(json, 'stops file')
  const stops = array(file.stops, 'stops').map(readStop)
  const platforms = array(file.platforms, 'platforms').map((value, i) => {
    const platform = readPlatform(value, i)
    if (!stops[platform.stop]) {
      throw new TimetableFormatError(`platforms[${i}] names a stop that is not in the file`)
    }
    return platform
  })
  const byId = new Map(platforms.map((p) => [p.id, stops[p.stop]]))
  return {
    stops,
    platforms,
    stopForPlatform: (id) => byId.get(platformId(id)),
  }
}

function readStop(value: unknown, i: number): StopRecord {
  const what = `stops[${i}]`
  const stop = object(value, what)
  return {
    id: string(stop.id, `${what}.id`),
    name: string(stop.name, `${what}.name`),
    lat: number(stop.lat, `${what}.lat`),
    lon: number(stop.lon, `${what}.lon`),
    modes: array(stop.modes, `${what}.modes`).map((mode) => readMode(mode, `${what}.modes`)),
  }
}

function readPlatform(value: unknown, i: number): PlatformRecord {
  const what = `platforms[${i}]`
  const platform = object(value, what)
  return {
    id: string(platform.id, `${what}.id`),
    stop: number(platform.stop, `${what}.stop`),
    name: string(platform.name, `${what}.name`),
    lat: number(platform.lat, `${what}.lat`),
    lon: number(platform.lon, `${what}.lon`),
  }
}

export function readMode(value: unknown, what: string): Mode {
  if (!MODES.includes(value as Mode)) throw new TimetableFormatError(`${what} has an unknown mode`)
  return value as Mode
}
