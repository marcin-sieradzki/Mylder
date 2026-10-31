// The simulated `multiDepartureBoard` and `multiArrivalBoard`: the departures from, or the
// arrivals at, every platform of the stops asked for, over a window, with expected times from the
// same world as `journeyPos`, each carrying its trip's own messages as `journeyDetail` gives them.
import 'server-only'
import type {
  Arrival,
  ArrivalBoardAnswer,
  Departure,
  DepartureBoardAnswer,
} from '../rejseplanen/answers.ts'
import {
  atClock,
  dateAndTime,
  envelope,
  journeyName,
  journeyRef,
  journeyStatus,
  platformsOfStops,
  prognosisOf,
  productOf,
} from './journeys.ts'
import { tripMessages } from './messages.ts'
import { hash } from './random.ts'
import {
  isIntervalLine,
  simulateTrip,
  simulatedDay,
  type SimulatedTrip,
  type SimulationSettings,
} from './world.ts'

const MINUTE = 60_000

export interface DepartureBoardRequest {
  /** The stop or platform ids asked for, as the API writes them. */
  readonly ids: readonly string[]
  /** The window's start: the request's date and time, else now. */
  readonly from: number
  readonly duration: number
  readonly maxJourneys: number
}

/** Reads a request's query as Rejseplanen would: `idList`, `date`, `time`, `duration`, `maxJourneys`. */
export function readDepartureBoardRequest(
  { timetable }: SimulationSettings,
  query: URLSearchParams,
  now: number,
): DepartureBoardRequest {
  const ids = (query.get('idList') ?? query.get('id') ?? '').split('|').filter(Boolean)
  const date = query.get('date')
  const time = query.get('time')
  let from = Math.floor(now / MINUTE) * MINUTE
  if (date && time) from = atClock(date, time, timetable.manifest.timezone)
  const positive = (name: string, fallback: number) => {
    const value = Number(query.get(name) ?? '')
    return query.get(name) && Number.isFinite(value) && value > 0 ? value : fallback
  }
  return {
    ids,
    from,
    duration: positive('duration', 60),
    maxJourneys: positive('maxJourneys', Infinity),
  }
}

/** Which side of its calls a board lists: the trips leaving, or the trips arriving. */
type Side = 'departure' | 'arrival'

/** What a departure and an arrival share: the call, its times on `side`, track and messages. */
function boardCall(
  settings: SimulationSettings,
  simulated: SimulatedTrip,
  i: number,
  now: number,
  side: Side,
) {
  const { timetable } = settings
  const { timezone } = timetable.manifest
  const { trip } = simulated
  const platform = timetable.stops.platforms[trip.calls[i].platform]
  const planned = trip.calls[i][side]
  const expected = simulated.calls[i][side]
  const cancelled = simulated.cancelled || simulated.cancelledCalls.includes(i)
  const realtime = !isIntervalLine(trip) && !cancelled
  const [date, time] = dateAndTime(planned, timezone)
  const [rtDate, rtTime] = dateAndTime(expected, timezone)
  // Tracks are made up, one per platform, where trains have them: the planned one always, and the
  // realtime one beside it with a prognosis, as Rejseplanen gives them.
  const train = trip.line.mode === 'train' || trip.line.mode === 's-tog'
  const track = train ? String(1 + (hash(platform.id) % 8)) : undefined
  const messages = tripMessages(settings, simulated, now)
  return {
    JourneyDetailRef: { ref: journeyRef(timetable, trip, simulated.journeyNumber) },
    name: journeyName(trip),
    type: 'ST',
    stop: platform.name,
    stopExtId: platform.id,
    lon: platform.lon,
    lat: platform.lat,
    time,
    date,
    ...(track !== undefined && { track }),
    ...(realtime && expected !== planned && { rtTime, rtDate }),
    ...(realtime && track !== undefined && { rtTrack: track }),
    ...(realtime && { prognosisType: prognosisOf(simulated) }),
    reachable: !cancelled,
    ...(cancelled && { cancelled: true }),
    JourneyStatus: journeyStatus(simulated),
    ProductAtStop: productOf(trip, simulated.journeyNumber),
    ...(messages.length > 0 && { Messages: { Message: messages } }),
  }
}

function departure(
  settings: SimulationSettings,
  simulated: SimulatedTrip,
  i: number,
  now: number,
): Departure {
  return {
    ...boardCall(settings, simulated, i, now, 'departure'),
    direction: simulated.trip.headsign,
  }
}

/** An arrival names the stop its trip starts from, as the timetable names it. */
function arrival(
  settings: SimulationSettings,
  simulated: SimulatedTrip,
  i: number,
  now: number,
): Arrival {
  const { platforms, stops } = settings.timetable.stops
  const first = platforms[simulated.trip.calls[0].platform]
  return {
    ...boardCall(settings, simulated, i, now, 'arrival'),
    origin: stops[first.stop].name,
  }
}

/**
 * The calls a board lists on `side` at the platforms of the stops asked for, whose expected time
 * falls in the window, soonest first: every call but a trip's last for departures, and every call
 * but its first for arrivals.
 */
function boardCalls<R extends { readonly name: string }>(
  settings: SimulationSettings,
  request: DepartureBoardRequest,
  now: number,
  side: Side,
  rowOf: (simulated: SimulatedTrip, i: number) => R,
): R[] {
  const platforms = new Set(platformsOfStops(settings.timetable, request.ids))
  const until = request.from + request.duration * MINUTE
  const found: { at: number; row: R }[] = []
  const { timetable } = settings
  // The window may pass midnight into the next service day, whose first trips leave before it ends.
  const days = [request.from, until, now].flatMap((moment) => timetable.serviceDaysAt(moment))
  for (const day of new Set(days)) {
    const calling = new Set(
      [...platforms].flatMap((p) => simulatedDay(settings, day).byPlatform.get(p) ?? []),
    )
    for (const trip of calling) {
      const simulated = simulateTrip(settings, trip, now)
      const [first, last] =
        side === 'departure' ? [0, trip.calls.length - 2] : [1, trip.calls.length - 1]
      for (let i = first; i <= last; i++) {
        const at = simulated.calls[i][side]
        if (!platforms.has(trip.calls[i].platform) || at < request.from || at >= until) continue
        found.push({ at, row: rowOf(simulated, i) })
      }
    }
  }
  return found
    .sort((a, b) => a.at - b.at || a.row.name.localeCompare(b.row.name))
    .slice(0, request.maxJourneys)
    .map(({ row }) => row)
}

/** The `multiDepartureBoard` answer for a request, at a moment. */
export function departureBoard(
  settings: SimulationSettings,
  request: DepartureBoardRequest,
  now: number,
): DepartureBoardAnswer {
  const departures = boardCalls(settings, request, now, 'departure', (simulated, i) =>
    departure(settings, simulated, i, now),
  )
  const head = envelope(now, settings.timetable.manifest.timezone)
  return departures.length > 0 ? { Departure: departures, ...head } : head
}

/**
 * The `multiArrivalBoard` answer for a request, at a moment: asked as the departure board is, the
 * trips arriving at the stops' platforms over the window.
 */
export function arrivalBoard(
  settings: SimulationSettings,
  request: DepartureBoardRequest,
  now: number,
): ArrivalBoardAnswer {
  const arrivals = boardCalls(settings, request, now, 'arrival', (simulated, i) =>
    arrival(settings, simulated, i, now),
  )
  const head = envelope(now, settings.timetable.manifest.timezone)
  return arrivals.length > 0 ? { Arrival: arrivals, ...head } : head
}
