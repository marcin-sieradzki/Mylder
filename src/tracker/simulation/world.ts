// The simulated city at a moment: which trips are on the map, how late each runs, where each is
// and which of them report. Every service the simulation answers reads this one world, so a
// departure board, a trip's detail and a journeyPos answer in the same minute agree.
import 'server-only'
import {
  timedCalls,
  tripAt,
  WAITING_FROM,
  type Call,
  type TimedCall,
  type Vehicle,
} from '../../domain/trip-motion.ts'
import type { PlannedTrip } from '../../timetable/trips.ts'
import type { Timetable } from '../timetable.ts'
import { chance } from './random.ts'
import type { Scenario } from './scenarios.ts'

const MINUTE = 60_000

/** No simulated trip runs later than this, so a trip is looked at only near its planned times. */
export const MAX_DELAY = 15 * MINUTE

/** One trip of the simulated city at a moment. */
export interface SimulatedTrip {
  readonly trip: PlannedTrip
  /** Its delay now, in seconds, a whole number of minutes as Rejseplanen's times have. */
  readonly delay: number
  /** Each call's expected times: those it kept for calls behind it, `delay` for those ahead. */
  readonly calls: readonly TimedCall[]
  /** Where it is, when it is on the map: Waiting at its first stop, or underway. */
  readonly vehicle: Vehicle | undefined
  /** Whether its vehicle reports its position, so that `REPORT_ONLY` carries it. */
  readonly reports: boolean
  /** Whether `CALC_REPORT` carries it, with a reported or a computed position. */
  readonly carried: boolean
}

export interface World {
  readonly now: number
  /** The trips the timetable puts near the map now, on or about to join it or just off it. */
  readonly trips: readonly SimulatedTrip[]
}

export interface SimulationSettings {
  readonly timetable: Timetable
  readonly scenario: Scenario
  readonly seed: number
}

/**
 * A trip's delay, in seconds, at each minute up to `until`: drawn for its day from the scenario's
 * spread, then drifting a few seconds a minute from when it first stands Waiting, never early by
 * more than a minute nor later than the cap. Exact to the second; the expected times round it.
 */
export function delays(
  settings: SimulationSettings,
  trip: PlannedTrip,
  until: number,
): (minute: number) => number {
  const { scenario, seed } = settings
  const spread = scenario.delay[trip.line.mode]
  const start = Math.floor((trip.calls[0].departure - WAITING_FROM) / MINUTE)
  const end = Math.min(until, Math.ceil(trip.calls.at(-1)!.arrival / MINUTE))
  const walk = [spread.from + (spread.to - spread.from) * chance(seed, trip.key, 'delay') ** 2]
  if (spread.from !== spread.to) {
    for (let m = start + 1; m <= end; m++) {
      const step = (chance(seed, trip.key, m) * 2 - 1) * scenario.drift
      walk.push(Math.min(Math.max(walk.at(-1)! + step, -60), MAX_DELAY / 1000))
    }
  }
  return (minute) => walk[Math.min(Math.max(minute - start, 0), walk.length - 1)]
}

/** Seconds rounded to whole minutes, as Rejseplanen's expected times are given. */
const toMinutes = (seconds: number) => Math.round(seconds / 60) * 60 || 0

/**
 * A trip's calls with their expected times at a moment. A call the trip has left keeps the
 * delay it had when it left; the calls ahead take its delay now.
 */
function expectedCalls(trip: PlannedTrip, delayAt: (minute: number) => number, now: number) {
  const delayNow = toMinutes(delayAt(Math.floor(now / MINUTE))) * 1000
  return trip.calls.map((call): Call => {
    const then = toMinutes(delayAt(Math.floor(call.departure / MINUTE))) * 1000
    const delay = call.departure + then <= now ? then : delayNow
    return {
      arrival: call.arrival,
      departure: call.departure,
      expectedArrival: call.arrival + delay,
      expectedDeparture: call.departure + delay,
    }
  })
}

/** One trip at a moment. */
export function simulateTrip(
  settings: SimulationSettings,
  trip: PlannedTrip,
  now: number,
): SimulatedTrip {
  const { timetable, scenario, seed } = settings
  const mode = trip.line.mode
  const minute = Math.floor(now / MINUTE)
  const delayAt = delays(settings, trip, minute)
  const calls = timedCalls(expectedCalls(trip, delayAt, now))
  const delay = toMinutes(delayAt(minute))
  // The Metro is in no answer, whatever a scenario says, as an interval line (ADR 0006).
  const metro = mode === 'metro'
  const reports = !metro && chance(seed, trip.key, 'reports') < scenario.reporting[mode]
  const carried =
    reports || (!metro && chance(seed, trip.key, 'computed') < scenario.computed[mode])
  const vehicle = tripAt(calls, timetable.pathOf(trip.pattern), now)
  return { trip, delay, calls, vehicle, reports, carried }
}

/**
 * The simulated city at a moment: every trip of the service days running now whose planned
 * times, with room for the latest delay, put it near the map.
 */
export function worldAt(settings: SimulationSettings, now: number): World {
  const { timetable } = settings
  const trips: SimulatedTrip[] = []
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of timetable.tripsOn(day)) {
      const first = trip.calls[0].departure
      const last = trip.calls.at(-1)!.arrival
      if (now < first - WAITING_FROM - MINUTE || now > last + MAX_DELAY) continue
      trips.push(simulateTrip(settings, trip, now))
    }
  }
  return { now, trips }
}
