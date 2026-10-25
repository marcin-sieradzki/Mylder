import { addDays, daysBetween } from '../../src/timetable/dates.ts'
import type { DayProfilesFile, IsoDate, Manifest, TripsFile } from '../../src/timetable/format.ts'
import type { Trips } from '../../src/timetable/trips.ts'
import { serviceDayStart, wallClock } from '../../src/timetable/time.ts'
import { runningDays, type Feed, type Service, type Trip } from './feed.ts'

const QUARTER = 15 * 60 * 1000

/**
 * Every trip in the window as a pattern reference, a first departure, a shared run profile and
 * a shared service.
 */
export function buildTrips(
  feed: Feed,
  patternOf: ReadonlyMap<Trip, number>,
  window: Manifest['window'],
): TripsFile {
  const length = daysBetween(window.first, window.last) + 1
  const services: string[] = []
  const serviceIndex = new Map<string, number>()
  const indexOfService = (service: Service) => {
    const days = Array<string>(length).fill('0')
    for (const day of runningDays(service)) {
      const i = daysBetween(window.first, day)
      if (i >= 0 && i < length) days[i] = '1'
    }
    return dedupe(days.join(''), services, serviceIndex)
  }
  const servicesById = new Map<string, number>()

  const profiles: number[][] = []
  const profileIndex = new Map<string, number>()

  const rows = feed.trips
    .flatMap((trip) => {
      const service = feed.services.get(trip.serviceId)
      if (!service) return []
      let s = servicesById.get(service.id)
      if (s === undefined) servicesById.set(service.id, (s = indexOfService(service)))
      if (!services[s].includes('1')) return []
      const departure = trip.calls[0].departure
      // Each offset as the step from the value before, which gzip packs tighter.
      let previous = departure
      const steps = trip.calls.flatMap((c) => {
        const step = [c.arrival - previous, c.departure - c.arrival]
        previous = c.departure
        return step
      })
      const rail = trip.route.mode === 's-tog' || trip.route.mode === 'train'
      return [
        {
          pattern: patternOf.get(trip)!,
          departure,
          profile: dedupe(steps, profiles, profileIndex),
          service: s,
          number: rail ? trip.shortName : '',
        },
      ]
    })
    .sort((a, b) => a.pattern - b.pattern || a.departure - b.departure || a.service - b.service)

  return {
    first: window.first,
    services,
    profiles,
    trips: {
      pattern: rows.map((r) => r.pattern),
      departure: rows.map((r) => r.departure),
      profile: rows.map((r) => r.profile),
      service: rows.map((r) => r.service),
      number: rows.map((r) => r.number),
    },
  }
}

/**
 * Planned trips underway at each quarter hour of the clock, for each day of the window. A trip
 * is underway from its first departure until its last arrival.
 */
export function buildDayProfiles(
  trips: Trips,
  window: Manifest['window'],
  timezone: string,
): DayProfilesFile {
  const days: IsoDate[] = []
  for (let day = window.first; day <= window.last; day = addDays(day, 1)) days.push(day)

  // Every quarter hour's moment across the window, and where each day's begin.
  const quarters: number[] = []
  const dayStarts: number[] = []
  for (const day of days) {
    dayStarts.push(quarters.length)
    const end = wallClock(addDays(day, 1), 0, timezone)
    for (let t = wallClock(day, 0, timezone); t < end; t += QUARTER) quarters.push(t)
  }
  dayStarts.push(quarters.length)
  const counts = new Array<number>(quarters.length).fill(0)
  /** The first quarter at or after a moment. */
  const firstQuarter = (t: number) => {
    let low = 0
    let high = quarters.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (quarters[mid] < t) low = mid + 1
      else high = mid
    }
    return low
  }

  days.forEach((day, d) => {
    const start = serviceDayStart(day, timezone)
    const { departure, profile, service } = trips.trips
    for (let t = 0; t < departure.length; t++) {
      if (trips.services[service[t]][d] !== '1') continue
      const offsets = trips.profiles[profile[t]]
      const from = start + departure[t] * 1000
      const to = from + offsets[offsets.length - 2] * 1000
      for (let q = firstQuarter(from); q < quarters.length && quarters[q] < to; q++) counts[q]++
    }
  })

  return {
    first: window.first,
    days: days.map((_, d) => counts.slice(dayStarts[d], dayStarts[d + 1])),
  }
}

/** The index of `value` in `list`, adding it the first time it is seen. */
function dedupe<T>(value: T, list: T[], index: Map<string, number>): number {
  const key = JSON.stringify(value)
  let i = index.get(key)
  if (i === undefined) {
    i = list.length
    list.push(value)
    index.set(key, i)
  }
  return i
}
