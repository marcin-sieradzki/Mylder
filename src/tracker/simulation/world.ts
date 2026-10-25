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
import type { IsoDate } from '../../timetable/format.ts'
import type { PlannedTrip } from '../../timetable/trips.ts'
import type { Timetable } from '../timetable.ts'
import { chance, hash } from './random.ts'
import type { Scenario } from './scenarios.ts'

const MINUTE = 60_000

/** No simulated trip runs later than this, so a trip is looked at only near its planned times. */
export const MAX_DELAY = 15 * MINUTE

/**
 * Whether a trip runs on an interval line, the Metro (ADR 0006): it is in no answer, never
 * cancelled and never doubled, and its departures carry no prognosis, whatever a scenario says.
 */
export const isIntervalLine = (trip: PlannedTrip) => trip.line.mode === 'metro'

/** One trip of the simulated city at a moment. */
export interface SimulatedTrip {
  readonly trip: PlannedTrip
  /** Its journey number for the day, the `ZI` of its reference. */
  readonly journeyNumber: number
  /** Whether it is an Extra trip: one the timetable doesn't have. */
  readonly extra: boolean
  /** Whether it is cancelled outright. A cancelled trip is on no map and in no position answer. */
  readonly cancelled: boolean
  /** The calls it passes without calling, by their index. */
  readonly cancelledCalls: readonly number[]
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
  /** Whether it has gone quiet now, so that no position answer carries it. */
  readonly quiet: boolean
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

/** A service day's trips as the simulation runs them: the timetable's and its Extra trips. */
export interface SimulatedDay {
  readonly trips: readonly PlannedTrip[]
  readonly extras: ReadonlySet<string>
  /** Each trip's journey number, by its key. */
  readonly numbers: ReadonlyMap<string, number>
  /** Each trip, by its journey number. */
  readonly byNumber: ReadonlyMap<number, PlannedTrip>
  /** The trips that call at each platform, by the platform's index. */
  readonly byPlatform: ReadonlyMap<number, readonly PlannedTrip[]>
}

/**
 * Each trip of a service day's journey number, stable for the trip: drawn from its key, and on a
 * clash moved on to the next free number, in key order.
 */
function journeyNumbers(trips: readonly PlannedTrip[]): Map<string, number> {
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

/**
 * A planned trip's Extra trips: as many as the scenario's rate draws, each a copy of it running
 * three to seven minutes behind the one before. The Metro gets none.
 */
function extrasOf({ scenario, seed }: SimulationSettings, trip: PlannedTrip): PlannedTrip[] {
  if (isIntervalLine(trip)) return []
  const whole = Math.floor(scenario.extra)
  const count = whole + (chance(seed, trip.key, 'extra') < scenario.extra - whole ? 1 : 0)
  const copies: PlannedTrip[] = []
  let behind = 0
  for (let i = 1; i <= count; i++) {
    behind += (3 + Math.floor(chance(seed, trip.key, 'extra', i) * 5)) * MINUTE
    const shift = behind
    copies.push({
      ...trip,
      key: `${trip.key}.extra${i}`,
      calls: trip.calls.map((call) => ({
        ...call,
        arrival: call.arrival + shift,
        departure: call.departure + shift,
      })),
    })
  }
  return copies
}

const days = new WeakMap<SimulationSettings, Map<IsoDate, SimulatedDay>>()

/** A service day's simulated trips, worked out once per day for a simulation. */
export function simulatedDay(settings: SimulationSettings, day: IsoDate): SimulatedDay {
  let cached = days.get(settings)
  if (!cached) days.set(settings, (cached = new Map()))
  const known = cached.get(day)
  if (known) return known
  const planned = settings.timetable.tripsOn(day)
  const extraTrips = planned.flatMap((trip) => extrasOf(settings, trip))
  const trips = [...planned, ...extraTrips]
  const numbers = journeyNumbers(trips)
  const byPlatform = new Map<number, PlannedTrip[]>()
  for (const trip of trips) {
    for (const { platform } of trip.calls) {
      const calling = byPlatform.get(platform)
      if (calling) calling.push(trip)
      else byPlatform.set(platform, [trip])
    }
  }
  const simulated: SimulatedDay = {
    trips,
    extras: new Set(extraTrips.map((trip) => trip.key)),
    numbers,
    byNumber: new Map(trips.map((trip) => [numbers.get(trip.key)!, trip])),
    byPlatform,
  }
  cached.set(day, simulated)
  return simulated
}

/**
 * Whether a trip has gone quiet at a moment. A share of trips goes quiet once, somewhere along
 * their run, for a few whole minutes; a smaller share goes quiet partway and stays quiet.
 */
function quietAt({ scenario, seed }: SimulationSettings, trip: PlannedTrip, now: number): boolean {
  const { silence } = scenario
  const first = trip.calls[0].departure
  const run = trip.calls.at(-1)!.arrival - first
  const at = (label: string) =>
    first + Math.floor((chance(seed, trip.key, label) * run) / MINUTE) * MINUTE
  if (chance(seed, trip.key, 'gone') < silence.forGood && now >= at('gone at')) return true
  if (chance(seed, trip.key, 'silence') >= silence.share) return false
  const { from, to } = silence.minutes
  const minutes = from + Math.floor(chance(seed, trip.key, 'silence for') * (to - from + 1))
  const start = at('silence at')
  return now >= start && now < start + minutes * MINUTE
}

/** The call a trip passes without calling, when the scenario cancels one: never its first or last. */
function cancelledCallOf({ scenario, seed }: SimulationSettings, trip: PlannedTrip): number[] {
  if (
    isIntervalLine(trip) ||
    trip.calls.length < 3 ||
    chance(seed, trip.key, 'cancelled call') >= scenario.cancelledCall
  ) {
    return []
  }
  return [1 + Math.floor(chance(seed, trip.key, 'which call') * (trip.calls.length - 2))]
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
  const day = simulatedDay(settings, trip.serviceDay)
  const mode = trip.line.mode
  const minute = Math.floor(now / MINUTE)
  const delayAt = delays(settings, trip, minute)
  const calls = timedCalls(expectedCalls(trip, delayAt, now))
  const delay = toMinutes(delayAt(minute))
  const metro = isIntervalLine(trip)
  const reports = !metro && chance(seed, trip.key, 'reports') < scenario.reporting[mode]
  const carried =
    reports || (!metro && chance(seed, trip.key, 'computed') < scenario.computed[mode])
  const cancelled = !metro && chance(seed, trip.key, 'cancelled') < scenario.cancelled
  return {
    trip,
    journeyNumber: day.numbers.get(trip.key)!,
    extra: day.extras.has(trip.key),
    cancelled,
    cancelledCalls: cancelledCallOf(settings, trip),
    delay,
    calls,
    vehicle: cancelled ? undefined : tripAt(calls, timetable.pathOf(trip.pattern), now),
    reports,
    carried,
    quiet: quietAt(settings, trip, now),
  }
}

/**
 * The simulated city at a moment: every trip of the service days running now whose planned
 * times, with room for the latest delay, put it near the map.
 */
export function worldAt(settings: SimulationSettings, now: number): World {
  const { timetable } = settings
  const trips: SimulatedTrip[] = []
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of simulatedDay(settings, day).trips) {
      const first = trip.calls[0].departure
      const last = trip.calls.at(-1)!.arrival
      if (now < first - WAITING_FROM - MINUTE || now > last + MAX_DELAY) continue
      trips.push(simulateTrip(settings, trip, now))
    }
  }
  return { now, trips }
}
