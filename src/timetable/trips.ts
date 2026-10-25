import { daysBetween } from './dates.ts'
import type { IsoDate, LineRecord, PatternsFile, TripsFile } from './format.ts'
import { array, number, object, string, TimetableFormatError } from './parse.ts'
import { serviceDayStart } from './time.ts'

/** One trip of a service day, as the tracker keeps it. */
export interface PlannedTrip {
  /** Mylder's trip key, from the trip's content: mode, line, pattern, service day, first departure. */
  readonly key: string
  readonly line: LineRecord
  /** The index of its pattern in the patterns file. */
  readonly pattern: number
  readonly direction: number
  readonly headsign: string
  /** The train number, or undefined for a bus or Metro trip without one. */
  readonly number: string | undefined
  readonly serviceDay: IsoDate
  readonly calls: readonly PlannedCall[]
}

export interface PlannedCall {
  /** The index of its platform in the stops file. */
  readonly platform: number
  /** Planned times, as milliseconds since the epoch. */
  readonly arrival: number
  readonly departure: number
}

/** The trips file as the tracker uses it, with each run profile's offsets counted from the first departure. */
export interface Trips {
  readonly first: IsoDate
  readonly services: readonly string[]
  /** Each call's arrival and departure in seconds after the first departure, flattened. */
  readonly profiles: readonly (readonly number[])[]
  readonly trips: TripsFile['trips']
}

/** Parses the trips file. */
export function readTrips(json: unknown): Trips {
  const file = object(json, 'trips file')
  const services = array(file.services, 'services').map((s, i) => string(s, `services[${i}]`))
  const profiles = array(file.profiles, 'profiles').map((p, i) => {
    let total = 0
    return array(p, `profiles[${i}]`).map((step) => (total += number(step, `profiles[${i}]`)))
  })
  const columns = object(file.trips, 'trips')
  const numbers = (name: string) =>
    array(columns[name], `trips.${name}`).map((v) => number(v, `trips.${name}`))
  const trips = {
    pattern: numbers('pattern'),
    departure: numbers('departure'),
    profile: numbers('profile'),
    service: numbers('service'),
    number: array(columns.number, 'trips.number').map((v) => string(v, 'trips.number')),
  }
  const count = trips.pattern.length
  for (const [name, column] of Object.entries(trips)) {
    if (column.length !== count) {
      throw new TimetableFormatError(`trips.${name} has ${column.length} rows, not ${count}`)
    }
  }
  for (let i = 0; i < count; i++) {
    if (!profiles[trips.profile[i]] || services[trips.service[i]] === undefined) {
      throw new TimetableFormatError(`trip ${i} names a profile or service that is not in the file`)
    }
  }
  return { first: string(file.first, 'trips file.first'), services, profiles, trips }
}

/**
 * Every trip that runs on a service day, with each call's planned times. A service day's
 * trips run past midnight into the next date; their times count from the service day.
 */
export function expandServiceDay(
  trips: Trips,
  patterns: PatternsFile,
  day: IsoDate,
  timezone: string,
): PlannedTrip[] {
  const index = daysBetween(trips.first, day)
  if (index < 0) return []
  const start = serviceDayStart(day, timezone)
  const dayKey = day.replaceAll('-', '')
  const seen = new Map<string, number>()
  const planned: PlannedTrip[] = []
  const { pattern: patternColumn, departure: departures, profile: profileColumn } = trips.trips
  for (let t = 0; t < patternColumn.length; t++) {
    if (trips.services[trips.trips.service[t]][index] !== '1') continue
    const patternIndex = patternColumn[t]
    const departure = departures[t]
    const profile = profileColumn[t]
    const trainNumber = trips.trips.number[t]
    const pattern = patterns.patterns[patternIndex]
    const line = patterns.lines[pattern.line]
    const offsets = trips.profiles[profile]
    const base = `${line.mode}.${line.name}.${pattern.key}.${dayKey}.${clock(departure)}`
    const copies = (seen.get(base) ?? 0) + 1
    seen.set(base, copies)
    planned.push({
      // Two trips alike in all of that are told apart by their order.
      key: copies === 1 ? base : `${base}.${copies}`,
      line,
      pattern: patternIndex,
      direction: pattern.direction,
      headsign: pattern.headsign,
      number: trainNumber || undefined,
      serviceDay: day,
      calls: pattern.stops.map((platform, i) => ({
        platform,
        arrival: start + (departure + offsets[2 * i]) * 1000,
        departure: start + (departure + offsets[2 * i + 1]) * 1000,
      })),
    })
  }
  return planned
}

/** Service-day seconds as `HHMM`, or `HHMMSS` when the seconds aren't zero: 24:11 is `2411`. */
function clock(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const hhmm = pad(Math.floor(seconds / 3600)) + pad(Math.floor(seconds / 60) % 60)
  return seconds % 60 === 0 ? hhmm : hhmm + pad(seconds % 60)
}
