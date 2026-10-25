// A simulated trip in Rejseplanen's words: its journey reference, product, name and stops, and
// times as `HH:MM:SS` and `YYYY-MM-DD` in Danish time, as the answers write them.
import 'server-only'
import type { TimedCall } from '../../domain/trip-motion.ts'
import type { IsoDate, LineRecord } from '../../timetable/format.ts'
import { serviceDayStart } from '../../timetable/time.ts'
import type { PlannedTrip } from '../../timetable/trips.ts'
import type { Product, Stop, StopLocation } from '../rejseplanen/answers.ts'
import type { Timetable } from '../timetable.ts'
import { hash } from './random.ts'

/**
 * A line's product class, the bit it sets in `products`: 1 IC, 2 ICL, 4 regional, 8 other
 * trains, 16 S-tog, 32 bus, 64 express bus, 128 night bus, 512 ferry, 1024 Metro, 2048 light
 * rail. The timetable has no class, so it is read from the mode and the line's name.
 */
export function productClass(line: LineRecord): number {
  switch (line.mode) {
    case 's-tog':
      return 16
    case 'metro':
      return 1024
    case 'light-rail':
      return 2048
    case 'train':
      if (/^ICL/i.test(line.name)) return 2
      if (/^IC/i.test(line.name)) return 1
      if (/^R/i.test(line.name)) return 4
      return 8
    case 'bus':
      // Harbour buses sail as ferries in Rejseplanen's classes.
      if (/^99\d$/.test(line.name)) return 512
      if (/^N/i.test(line.name)) return 128
      if (/\d+[ES]$/i.test(line.name)) return 64
      return 32
  }
}

/** Each class's category, as `catOut` and `catIn` show it. */
const CATEGORIES: Readonly<Record<number, readonly [catOut: string, catIn: string]>> = {
  1: ['IC', 'IC'],
  2: ['ICL', 'ICL'],
  4: ['Re', 'RE'],
  8: ['Tog', 'TOG'],
  16: ['S-tog', 'S'],
  32: ['Bus', 'BUS'],
  64: ['Bus', 'EXB'],
  128: ['Natbus', 'NB'],
  512: ['Havnebus', 'HB'],
  1024: ['Metro', 'MET'],
  2048: ['Letbane', 'LET'],
}

/** A train's number as Rejseplanen prints it, without the GTFS's leading zeros. */
const trainNumber = (trip: PlannedTrip) => trip.number?.replace(/^0+(?=.)/, '')

const isTrain = (trip: PlannedTrip) => trip.line.mode === 'train' || trip.line.mode === 's-tog'

/** The journey's name: a train by its category and number, anything else by its line. */
export function journeyName(trip: PlannedTrip): string {
  const [catOut] = CATEGORIES[productClass(trip.line)]
  return trip.line.mode === 'train' && trip.number
    ? `${catOut} ${trainNumber(trip)}`
    : `${catOut} ${trip.line.name}`
}

export function productOf(trip: PlannedTrip, journeyNumber: number): Product {
  const cls = productClass(trip.line)
  const [catOut, catIn] = CATEGORIES[cls]
  return {
    name: journeyName(trip),
    displayNumber: trip.line.name,
    num: (isTrain(trip) && trainNumber(trip)) || String(journeyNumber),
    line: trip.line.name,
    catOut,
    catIn,
    cls: String(cls),
  }
}

/** A train's number for `trainNumber`, which only trains carry. */
export const trainNumberOf = (trip: PlannedTrip) => (isTrain(trip) ? trainNumber(trip) : undefined)

/** Minutes after the service day's start as `HMM`, the way references write a time: 24:11 is 2411. */
function referenceTime(day: IsoDate, moment: number, timezone: string): number {
  const minutes = Math.round((moment - serviceDayStart(day, timezone)) / 60_000)
  return Math.floor(minutes / 60) * 100 + (minutes % 60)
}

/** A service day as references write it: day, month and year, `91026` for 9 October 2026. */
export function referenceDay(day: IsoDate): string {
  return `${Number(day.slice(8, 10))}${day.slice(5, 7)}${day.slice(2, 4)}`
}

/**
 * A journey reference shaped like Rejseplanen's: its journey number (`ZI`) and day (`DA`), the
 * timetable version (`ST`), the first stop and departure (`FR`, `FT`), the last stop and arrival
 * (`TO`, `TT`), and the line (`ZE`), which the tracker's join reads.
 */
export function journeyRef(timetable: Timetable, trip: PlannedTrip, journeyNumber: number): string {
  const { timezone, version } = timetable.manifest
  const platform = (i: number) => timetable.stops.platforms[trip.calls.at(i)!.platform].id
  const first = referenceTime(trip.serviceDay, trip.calls[0].departure, timezone)
  const last = referenceTime(trip.serviceDay, trip.calls.at(-1)!.arrival, timezone)
  const cls = productClass(trip.line)
  const fields: [string, string | number][] = [
    ['VN', 1],
    ['ST', hash(version) % 10 ** 10],
    ['PI', 0],
    ['ZI', journeyNumber],
    ['TA', 0],
    ['DA', referenceDay(trip.serviceDay)],
    ['1S', platform(0)],
    ['1T', first],
    ['LS', platform(-1)],
    ['LT', last],
    ['PU', 86],
    ['RT', 1],
    ['CA', CATEGORIES[cls][1]],
    ['ZE', trip.line.name],
    ['ZB', journeyName(trip)],
    ['PC', Math.log2(cls)],
    ['FR', platform(0)],
    ['FT', first],
    ['TO', platform(-1)],
    ['TT', last],
  ]
  return `2|#${fields.map(([key, value]) => `${key}#${value}`).join('#')}#`
}

/**
 * Each trip of a service day's journey number, stable for the trip: drawn from its key, and on a
 * clash moved on to the next free number, in key order.
 */
export function journeyNumbers(trips: readonly PlannedTrip[]): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>()
  const taken = new Set<number>()
  for (const key of trips.map((trip) => trip.key).sort()) {
    let number = 10_000 + (hash(key) % 890_000)
    while (taken.has(number)) number = number === 899_999 ? 10_000 : number + 1
    taken.add(number)
    numbers.set(key, number)
  }
  return numbers
}

const numbersByDay = new WeakMap<Timetable, Map<IsoDate, ReadonlyMap<string, number>>>()

/** A trip's journey number, from its service day's numbers, worked out once per day. */
export function journeyNumberOf(timetable: Timetable, trip: PlannedTrip): number {
  let days = numbersByDay.get(timetable)
  if (!days) numbersByDay.set(timetable, (days = new Map()))
  let numbers = days.get(trip.serviceDay)
  if (!numbers)
    days.set(trip.serviceDay, (numbers = journeyNumbers(timetable.tripsOn(trip.serviceDay))))
  return numbers.get(trip.key)!
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** A moment's date, time and offset from UTC in the zone: `2026-10-26`, `10:33:00`, `+01:00`. */
function zoned(moment: number, timezone: string): Record<string, string> {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timezone, formatter)
  }
  const part: Record<string, string> = {}
  for (const { type, value } of formatter.formatToParts(moment)) part[type] = value
  return {
    date: `${part.year}-${part.month}-${part.day}`,
    time: `${part.hour}:${part.minute}:${part.second}`,
    offset: part.timeZoneName.replace('GMT', '') || '+00:00',
  }
}

/** A moment's date and time in the zone, as `YYYY-MM-DD` and `HH:MM:SS`. */
export function dateAndTime(moment: number, timezone: string): [date: string, time: string] {
  const { date, time } = zoned(moment, timezone)
  return [date, time]
}

/**
 * Every answer's envelope. `planRtTs`, when Rejseplanen last updated its realtime, is the start
 * of the simulated minute.
 */
export function envelope(now: number, timezone: string) {
  const { date, time, offset } = zoned(Math.floor(now / 60_000) * 60_000, timezone)
  return {
    serverVersion: '2.53.1.2',
    dialectVersion: '2.53-Rejseplanen',
    planRtTs: `${date}T${time}${offset}`,
  }
}

/** A platform as a stop location. */
export function stopLocation(timetable: Timetable, platform: number): StopLocation {
  const { name, id, lat, lon } = timetable.stops.platforms[platform]
  return { name, extId: id, lon, lat }
}

/**
 * A trip's calls as a journey's stops, those from `start` up to `end`: planned times, and
 * expected ones where they differ, as Rejseplanen leaves a realtime time out when it equals the
 * plan. A trip with `realtime` false, such as the Metro, has no prognosis at all.
 */
export function journeyStops(
  timetable: Timetable,
  trip: PlannedTrip,
  calls: readonly TimedCall[],
  realtime: boolean,
  start = 0,
  end = trip.calls.length,
): Stop[] {
  const { timezone } = timetable.manifest
  /** One side of a call: its planned time, and its expected one where it differs. */
  const times = (plan: number, expected: number) => {
    const [date, time] = dateAndTime(plan, timezone)
    if (!realtime) return { date, time }
    const [rtDate, rtTime] = dateAndTime(expected, timezone)
    return expected === plan
      ? { date, time, prognosis: 'PROGNOSED' as const }
      : { date, time, rtDate, rtTime, prognosis: 'PROGNOSED' as const }
  }
  return trip.calls.slice(start, end).map((planned, offset): Stop => {
    const i = start + offset
    const arrival = i > 0 ? times(planned.arrival, calls[i].arrival) : undefined
    const departure =
      i < trip.calls.length - 1 ? times(planned.departure, calls[i].departure) : undefined
    return {
      ...stopLocation(timetable, planned.platform),
      routeIdx: i,
      ...(arrival && { arrTime: arrival.time, arrDate: arrival.date }),
      ...(departure && { depTime: departure.time, depDate: departure.date }),
      ...(arrival?.rtTime && { rtArrTime: arrival.rtTime, rtArrDate: arrival.rtDate }),
      ...(departure?.rtTime && { rtDepTime: departure.rtTime, rtDepDate: departure.rtDate }),
      ...(arrival?.prognosis && { arrPrognosisType: arrival.prognosis }),
      ...(departure?.prognosis && { depPrognosisType: departure.prognosis }),
    }
  })
}
