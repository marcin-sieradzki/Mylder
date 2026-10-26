// The simulated `multiDepartureBoard`: the departures from every platform of the stops asked
// for, over a window, with expected times from the same world as `journeyPos`, each carrying its
// trip's own messages as `journeyDetail` gives them.
import 'server-only'
import type { Departure, DepartureBoardAnswer } from '../rejseplanen/answers.ts'
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

function departure(
  settings: SimulationSettings,
  simulated: SimulatedTrip,
  i: number,
  now: number,
): Departure {
  const { timetable } = settings
  const { timezone } = timetable.manifest
  const { trip } = simulated
  const platform = timetable.stops.platforms[trip.calls[i].platform]
  const planned = trip.calls[i].departure
  const expected = simulated.calls[i].departure
  const cancelled = simulated.cancelled || simulated.cancelledCalls.includes(i)
  const realtime = !isIntervalLine(trip) && !cancelled
  const [date, time] = dateAndTime(planned, timezone)
  const [rtDate, rtTime] = dateAndTime(expected, timezone)
  const train = trip.line.mode === 'train' || trip.line.mode === 's-tog'
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
    ...(realtime && expected !== planned && { rtTime, rtDate }),
    // Tracks are made up, one per platform, where trains have them.
    ...(realtime && train && { rtTrack: String(1 + (hash(platform.id) % 8)) }),
    ...(realtime && { prognosisType: prognosisOf(simulated) }),
    direction: trip.headsign,
    reachable: !cancelled,
    ...(cancelled && { cancelled: true }),
    JourneyStatus: journeyStatus(simulated),
    ProductAtStop: productOf(trip, simulated.journeyNumber),
    ...(messages.length > 0 && { Messages: { Message: messages } }),
  }
}

/** The `multiDepartureBoard` answer for a request, at a moment. */
export function departureBoard(
  settings: SimulationSettings,
  request: DepartureBoardRequest,
  now: number,
): DepartureBoardAnswer {
  const platforms = new Set(platformsOfStops(settings.timetable, request.ids))
  const until = request.from + request.duration * MINUTE
  const found: { at: number; departure: Departure }[] = []
  const { timetable } = settings
  // The window may pass midnight into the next service day, whose first trips leave before it ends.
  const days = [request.from, until, now].flatMap((moment) => timetable.serviceDaysAt(moment))
  for (const day of new Set(days)) {
    const calling = new Set(
      [...platforms].flatMap((p) => simulatedDay(settings, day).byPlatform.get(p) ?? []),
    )
    for (const trip of calling) {
      const simulated = simulateTrip(settings, trip, now)
      // A trip's last call is an arrival, not a departure.
      for (let i = 0; i < trip.calls.length - 1; i++) {
        const at = simulated.calls[i].departure
        if (!platforms.has(trip.calls[i].platform) || at < request.from || at >= until) continue
        found.push({ at, departure: departure(settings, simulated, i, now) })
      }
    }
  }
  const departures = found
    .sort((a, b) => a.at - b.at || a.departure.name.localeCompare(b.departure.name))
    .slice(0, request.maxJourneys)
    .map((row) => row.departure)
  const head = envelope(now, settings.timetable.manifest.timezone)
  return departures.length > 0 ? { Departure: departures, ...head } : head
}
