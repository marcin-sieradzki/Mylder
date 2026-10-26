// The stop and trip answers (docs/screens.md, "Vehicle detail" and "Stop departures"): a stop's
// departures and a trip's calls from the timetable plus the snapshot's delay for each trip. They
// share nothing with the run but the snapshot, so they are pure functions of the two; the tracker
// reads the snapshot and calls them. The on-demand calls (#32) fall back to them.
import 'server-only'
import { timedCalls } from '../domain/trip-motion.ts'
import type { Mode } from '../timetable/format.ts'
import { platformId } from '../timetable/stops.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import type { Snapshot, SnapshotTrip } from './snapshot.ts'
import type { Timetable } from './timetable.ts'

/** How long a stop's departures look ahead. */
export const DEPARTURES_AHEAD = 60 * 60_000

/** The most departures a stop's answer lists. */
export const MAX_DEPARTURES = 30

/** One departure from a stop: the timetable's time plus the snapshot's delay for its trip. */
export interface StopDeparture {
  readonly trip: string
  readonly line: string
  readonly mode: Mode
  readonly headsign: string
  readonly platform: string
  readonly scheduled: number
  readonly expected?: number
  readonly state: SnapshotTrip['state']
}

export interface StopDepartures {
  readonly stop: { readonly id: string; readonly name: string }
  /** The snapshot the delays came from, and when the next one is due. */
  readonly fetched: number
  readonly nextDue: number
  readonly departures: readonly StopDeparture[]
}

export interface TripCall {
  readonly index: number
  readonly stop: string
  readonly name: string
  readonly arrival: number
  readonly departure: number
  readonly expectedArrival?: number
  readonly expectedDeparture?: number
}

export interface TripDetail {
  readonly key: string
  readonly line: string
  readonly mode: Mode
  readonly headsign: string
  readonly pattern: number
  readonly state: SnapshotTrip['state']
  readonly delay?: number
  readonly fetched: number
  readonly nextDue: number
  readonly calls: readonly TripCall[]
}

/** What the answers read from a snapshot. */
export type SnapshotDelays = Pick<Snapshot, 'fetched' | 'nextDue' | 'trips'>

/** The snapshot's trips by key. */
const tripsByKey = (snapshot: SnapshotDelays) =>
  new Map(snapshot.trips.map((trip) => [trip.key, trip]))

/** A trip's calls shifted by the snapshot's delay for it, when it has one. */
const withDelay = (trip: PlannedTrip, delay: number | undefined) =>
  delay === undefined ? undefined : timedCalls(trip.calls, delay)

/** A stop's index by its own id, or by the id of one of its platforms; -1 for neither. */
export function stopIndexOf(timetable: Timetable, id: string): number {
  const { platforms, stops } = timetable.stops
  const byStop = stops.findIndex((stop) => stop.id === id)
  if (byStop >= 0) return byStop
  const platform = platforms.findIndex((each) => each.id === platformId(id))
  return platform >= 0 ? platforms[platform].stop : -1
}

/** A planned trip of the service days running at a moment, by its key. */
export function plannedTrip(
  timetable: Timetable,
  tripKey: string,
  now: number,
): PlannedTrip | undefined {
  for (const day of timetable.serviceDaysAt(now)) {
    const trip = timetable.tripsOn(day).find((each) => each.key === tripKey)
    if (trip) return trip
  }
  return undefined
}

/**
 * A stop's departures in the hour after the snapshot, across its platforms, soonest first, each at
 * its timetabled time shifted by the snapshot's delay for its trip; undefined for a stop the
 * timetable doesn't know, by its own id or a platform's.
 */
export function stopDeparturesFrom(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stopId: string,
): StopDepartures | undefined {
  const stopIndex = stopIndexOf(timetable, stopId)
  if (stopIndex < 0) return undefined
  const { platforms, stops } = timetable.stops
  const now = snapshot.fetched
  const onMap = tripsByKey(snapshot)
  const departures: StopDeparture[] = []
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of timetable.tripsOn(day)) {
      const live = onMap.get(trip.key)
      let expected: ReturnType<typeof withDelay> | null = null
      trip.calls.forEach((call, i) => {
        if (i === trip.calls.length - 1 || platforms[call.platform].stop !== stopIndex) return
        // Shift the trip's calls once, and only for a trip that calls here.
        if (expected === null) expected = withDelay(trip, live?.delay)
        const leaves = expected?.[i].departure ?? call.departure
        if (leaves < now || leaves > now + DEPARTURES_AHEAD) return
        departures.push({
          trip: trip.key,
          line: trip.line.name,
          mode: trip.line.mode,
          headsign: trip.headsign,
          platform: platforms[call.platform].id,
          scheduled: call.departure,
          ...(expected ? { expected: leaves } : {}),
          state: live?.state ?? 'timetable-only',
        })
      })
    }
  }
  departures.sort((a, b) => (a.expected ?? a.scheduled) - (b.expected ?? b.scheduled))
  const stop = stops[stopIndex]
  return {
    stop: { id: stop.id, name: stop.name },
    fetched: now,
    nextDue: snapshot.nextDue,
    departures: departures.slice(0, MAX_DEPARTURES),
  }
}

/**
 * A trip's calls at a moment, at their timetabled times and, when the snapshot has a delay for
 * it, those times shifted by the delay; undefined for a trip not running today.
 */
export function tripDetailFrom(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  tripKey: string,
  now: number,
): TripDetail | undefined {
  const trip = plannedTrip(timetable, tripKey, now)
  if (!trip) return undefined
  const { platforms } = timetable.stops
  const live = tripsByKey(snapshot).get(trip.key)
  const expected = withDelay(trip, live?.delay)
  return {
    key: trip.key,
    line: trip.line.name,
    mode: trip.line.mode,
    headsign: trip.headsign,
    pattern: trip.pattern,
    state: live?.state ?? 'timetable-only',
    ...(live?.delay === undefined ? {} : { delay: live.delay }),
    fetched: snapshot.fetched,
    nextDue: snapshot.nextDue,
    calls: trip.calls.map((call, index) => ({
      index,
      stop: platforms[call.platform].id,
      name: platforms[call.platform].name,
      arrival: call.arrival,
      departure: call.departure,
      ...(expected
        ? {
            expectedArrival: expected[index].arrival,
            expectedDeparture: expected[index].departure,
          }
        : {}),
    })),
  }
}
