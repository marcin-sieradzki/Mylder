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

/** A product class: the bit it sets in `products`, and its category as `catOut` and `catIn` show it. */
export interface ProductClass {
  readonly cls: number
  readonly catOut: string
  readonly catIn: string
}

const productClasses = (entries: [number, string, string][]) =>
  Object.fromEntries(entries.map(([cls, catOut, catIn]) => [catIn, { cls, catOut, catIn }]))

const CLASSES: Readonly<Record<string, ProductClass>> = productClasses([
  [1, 'IC', 'IC'],
  [2, 'ICL', 'ICL'],
  [4, 'Re', 'RE'],
  [8, 'Tog', 'TOG'],
  [16, 'S-tog', 'S'],
  [32, 'Bus', 'BUS'],
  [64, 'Bus', 'EXB'],
  [128, 'Natbus', 'NB'],
  [512, 'Havnebus', 'HB'],
  [1024, 'Metro', 'MET'],
  [2048, 'Letbane', 'LET'],
])

/**
 * A line's product class. The timetable has none, so it is read from the mode and the line's
 * name: harbour buses sail as ferries, `N` lines are night buses and `E` or `S` lines express.
 */
export function productClass(line: LineRecord): ProductClass {
  switch (line.mode) {
    case 's-tog':
      return CLASSES.S
    case 'metro':
      return CLASSES.MET
    case 'light-rail':
      return CLASSES.LET
    case 'train':
      if (/^ICL/i.test(line.name)) return CLASSES.ICL
      if (/^IC/i.test(line.name)) return CLASSES.IC
      if (/^R/i.test(line.name)) return CLASSES.RE
      return CLASSES.TOG
    case 'bus':
      if (/^99\d$/.test(line.name)) return CLASSES.HB
      if (/^N/i.test(line.name)) return CLASSES.NB
      if (/\d+[ES]$/i.test(line.name)) return CLASSES.EXB
      return CLASSES.BUS
  }
}

/** A train's number as Rejseplanen prints it, without the GTFS's leading zeros. */
const trainNumber = (trip: PlannedTrip) => trip.number?.replace(/^0+(?=.)/, '')

const isTrain = (trip: PlannedTrip) => trip.line.mode === 'train' || trip.line.mode === 's-tog'

/** The journey's name: a train by its category and number, anything else by its line. */
export function journeyName(trip: PlannedTrip): string {
  const { catOut } = productClass(trip.line)
  return trip.line.mode === 'train' && trip.number
    ? `${catOut} ${trainNumber(trip)}`
    : `${catOut} ${trip.line.name}`
}

export function productOf(trip: PlannedTrip, journeyNumber: number): Product {
  const { cls, catOut, catIn } = productClass(trip.line)
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
  const { cls, catIn } = productClass(trip.line)
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
    ['CA', catIn],
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

/** What a journey's stops need from a simulated trip. */
export interface StopsOf {
  readonly trip: PlannedTrip
  readonly calls: readonly TimedCall[]
  readonly cancelledCalls: readonly number[]
}

/**
 * A trip's calls as a journey's stops, those from `start` up to `end`: planned times, and
 * expected ones where they differ, as Rejseplanen leaves a realtime time out when it equals the
 * plan. A trip without `realtime`, such as the Metro, has no prognosis at all; a cancelled call
 * says so on both sides.
 */
export function journeyStops(
  timetable: Timetable,
  { trip, calls, cancelledCalls }: StopsOf,
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
      ...(cancelledCalls.includes(i) && { cancelledArrival: true, cancelledDeparture: true }),
    }
  })
}
