import { join } from 'node:path'
import { addDays, weekday } from '../../src/timetable/dates.ts'
import type { Box, IsoDate, Mode } from '../../src/timetable/format.ts'
import { forEachRow } from './csv.ts'

// The GTFS feed as the job reads it: only the lines of Mylder's modes, only the trips with a
// call inside the box (with all their calls, inside or not), and only the stops those trips
// call at.

export interface Route {
  readonly id: string
  readonly line: string
  readonly mode: Mode
}

export interface StopRow {
  /** The GTFS id, twelve digits with leading zeros. */
  readonly gtfsId: string
  readonly name: string
  readonly lat: number
  readonly lon: number
}

export interface Call {
  readonly stop: StopRow
  /** Seconds after the service day's noon minus twelve hours; can pass 24:00. */
  readonly arrival: number
  readonly departure: number
}

export interface Trip {
  readonly id: string
  readonly route: Route
  readonly serviceId: string
  readonly shapeId: string
  readonly headsign: string
  readonly shortName: string
  readonly direction: string
  readonly calls: readonly Call[]
}

export interface Service {
  readonly id: string
  /** Monday first, as `calendar.txt` orders its columns. */
  readonly weekdays: readonly boolean[]
  readonly start: string
  readonly end: string
  readonly added: ReadonlySet<string>
  readonly removed: ReadonlySet<string>
}

export interface Feed {
  readonly timezone: string
  readonly trips: readonly Trip[]
  readonly stops: readonly StopRow[]
  readonly services: ReadonlyMap<string, Service>
  /** Pairs of GTFS stop ids the feed links for transfers, both kept. */
  readonly transfers: readonly (readonly [string, string])[]
  /** The points of the kept trips' shapes, in order, as `[lat, lon]`. */
  readonly shapes: ReadonlyMap<string, readonly (readonly [number, number])[]>
  /** Each file's row count, before any cut. */
  readonly rows: Readonly<Record<string, number>>
  /** The last day any service in the feed runs to, kept or not. */
  readonly calendarEnd: IsoDate
}

/** The files the job reads; a feed without one of them is refused. */
export const GTFS_FILES = [
  'agency.txt',
  'routes.txt',
  'trips.txt',
  'stop_times.txt',
  'stops.txt',
  'shapes.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'transfers.txt',
] as const

/**
 * Mylder's mode for a GTFS line, or undefined for a line Mylder doesn't show: ferries, demand
 * buses and the like. `route_type` 4 is a ferry, except Movia's harbour buses.
 */
export function modeOf(routeType: string, agencyName: string): Mode | undefined {
  switch (routeType) {
    case '109':
      return 's-tog'
    case '1':
      return 'metro'
    case '0':
      return 'light-rail'
    case '2':
      return 'train'
    case '3':
    case '700':
      return 'bus'
    case '4':
      return agencyName === 'Movia' ? 'bus' : undefined
    default:
      return undefined
  }
}

export function inBox(box: Box, lat: number, lon: number): boolean {
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east
}

/** GTFS `H:MM:SS` to seconds; hours run past 24 for a service day's late trips. */
export function seconds(time: string): number {
  const [h, m, s] = time.split(':')
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

export async function readFeed(dir: string, box: Box): Promise<Feed> {
  const file = (name: string) => join(dir, name)
  const rows: Record<string, number> = {}
  const each = async (name: string, columns: string[], onRow: (values: string[]) => void) => {
    rows[name] = await forEachRow(file(name), columns, onRow)
  }

  const agencies = new Map<string, string>()
  let timezone = ''
  await each('agency.txt', ['agency_id', 'agency_name', 'agency_timezone'], (r) => {
    agencies.set(r[0], r[1])
    timezone ||= r[2]
  })

  const routes = new Map<string, Route>()
  await each(
    'routes.txt',
    ['route_id', 'agency_id', 'route_short_name', 'route_type'],
    ([id, agency, line, type]) => {
      const mode = modeOf(type, agencies.get(agency) ?? '')
      if (mode) routes.set(id, { id, line, mode })
    },
  )

  interface TripRow extends Omit<Trip, 'calls'> {
    calls: { stop: number; arrival: number; departure: number; sequence: number }[]
    touchesBox: boolean
  }
  const trips = new Map<string, TripRow>()
  await each(
    'trips.txt',
    [
      'trip_id',
      'route_id',
      'service_id',
      'shape_id',
      'trip_headsign',
      'trip_short_name',
      'direction_id',
    ],
    ([id, routeId, serviceId, shapeId, headsign, shortName, direction]) => {
      const route = routes.get(routeId)
      if (!route) return
      trips.set(id, {
        id,
        route,
        serviceId,
        shapeId,
        headsign: headsign.replace(/\s+/g, ' ').trim(),
        shortName,
        direction,
        calls: [],
        touchesBox: false,
      })
    },
  )

  const allStops: StopRow[] = []
  const stopIndex = new Map<string, number>()
  await each(
    'stops.txt',
    ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
    ([gtfsId, name, lat, lon]) => {
      stopIndex.set(gtfsId, allStops.length)
      allStops.push({ gtfsId, name: name.replace(/\s+/g, ' ').trim(), lat: +lat, lon: +lon })
    },
  )
  const stopInBox = allStops.map((s) => inBox(box, s.lat, s.lon))

  await each(
    'stop_times.txt',
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
    ([tripId, arrival, departure, stopId, sequence]) => {
      const trip = trips.get(tripId)
      if (!trip) return
      const stop = stopIndex.get(stopId)
      if (stop === undefined) throw new Error(`stop_times.txt names an unknown stop ${stopId}`)
      if (stopInBox[stop]) trip.touchesBox = true
      trip.calls.push({
        stop,
        arrival: seconds(arrival || departure),
        departure: seconds(departure || arrival),
        sequence: Number(sequence),
      })
    },
  )

  const keptTrips: Trip[] = []
  const keptStops = new Set<number>()
  for (const trip of trips.values()) {
    if (!trip.touchesBox) continue
    trip.calls.sort((a, b) => a.sequence - b.sequence)
    for (const call of trip.calls) keptStops.add(call.stop)
    keptTrips.push({
      ...trip,
      calls: trip.calls.map((c) => ({
        stop: allStops[c.stop],
        arrival: c.arrival,
        departure: c.departure,
      })),
    })
  }
  const stops = [...keptStops].sort((a, b) => a - b).map((i) => allStops[i])
  const kept = new Set(stops.map((s) => s.gtfsId))

  const usedServices = new Set(keptTrips.map((t) => t.serviceId))
  const { services, calendarEnd } = await readServices(each, usedServices)

  const transfers: [string, string][] = []
  await each('transfers.txt', ['from_stop_id', 'to_stop_id'], ([from, to]) => {
    if (from !== to && kept.has(from) && kept.has(to)) transfers.push([from, to])
  })

  const shapes = await readShapes(each, new Set(keptTrips.map((t) => t.shapeId)))

  return { timezone, trips: keptTrips, stops, services, transfers, shapes, rows, calendarEnd }
}

async function readServices(
  each: (name: string, columns: string[], onRow: (values: string[]) => void) => Promise<void>,
  used: ReadonlySet<string>,
): Promise<{ services: Map<string, Service>; calendarEnd: IsoDate }> {
  let calendarEnd = ''
  const services = new Map<
    string,
    { weekdays: boolean[]; start: string; end: string; added: Set<string>; removed: Set<string> }
  >()
  const service = (id: string) => {
    let s = services.get(id)
    if (!s) {
      s = {
        weekdays: Array(7).fill(false),
        start: '',
        end: '',
        added: new Set(),
        removed: new Set(),
      }
      services.set(id, s)
    }
    return s
  }
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  await each('calendar.txt', ['service_id', ...days, 'start_date', 'end_date'], ([id, ...rest]) => {
    if (isoDate(rest[8]) > calendarEnd) calendarEnd = isoDate(rest[8])
    if (!used.has(id)) return
    const s = service(id)
    s.weekdays = rest.slice(0, 7).map((d) => d === '1')
    s.start = isoDate(rest[7])
    s.end = isoDate(rest[8])
  })
  await each('calendar_dates.txt', ['service_id', 'date', 'exception_type'], ([id, date, type]) => {
    if (type === '1' && isoDate(date) > calendarEnd) calendarEnd = isoDate(date)
    if (!used.has(id)) return
    const s = service(id)
    if (type === '1') s.added.add(isoDate(date))
    if (type === '2') s.removed.add(isoDate(date))
  })
  return { services: new Map([...services].map(([id, s]) => [id, { id, ...s }])), calendarEnd }
}

/** `20260616` to `2026-06-16`. */
function isoDate(gtfsDate: string): string {
  return `${gtfsDate.slice(0, 4)}-${gtfsDate.slice(4, 6)}-${gtfsDate.slice(6, 8)}`
}

async function readShapes(
  each: (name: string, columns: string[], onRow: (values: string[]) => void) => Promise<void>,
  ids: ReadonlySet<string>,
): Promise<Map<string, (readonly [number, number])[]>> {
  const rows = new Map<string, { lat: number; lon: number; sequence: number }[]>()
  await each(
    'shapes.txt',
    ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
    ([id, lat, lon, sequence]) => {
      if (!ids.has(id)) return
      let points = rows.get(id)
      if (!points) rows.set(id, (points = []))
      points.push({ lat: +lat, lon: +lon, sequence: +sequence })
    },
  )
  return new Map(
    [...rows].map(([id, points]) => [
      id,
      points.sort((a, b) => a.sequence - b.sequence).map((p) => [p.lat, p.lon] as const),
    ]),
  )
}

/** Every day a service runs, from its weekdays between its dates and its added days. */
export function* runningDays(service: Service): Generator<IsoDate> {
  if (service.start) {
    for (let day = service.start; day <= service.end; day = addDays(day, 1)) {
      if (service.weekdays[weekday(day)] && !service.removed.has(day)) yield day
    }
  }
  for (const day of service.added) if (!service.removed.has(day)) yield day
}
