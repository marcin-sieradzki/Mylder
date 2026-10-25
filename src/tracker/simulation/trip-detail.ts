// The simulated `journeyDetail`: one journey's calls with planned and expected times, cancelled
// calls, its last position and its own messages, from the same world as `journeyPos`.
import 'server-only'
import type { JourneyDetailAnswer } from '../rejseplanen/answers.ts'
import { envelope, journeyRef, journeyStatus, journeyStops, productOf } from './journeys.ts'
import { tripMessages } from './messages.ts'
import { isIntervalLine, simulateTrip, simulatedDay, type SimulationSettings } from './world.ts'

/** A reference's journey number and service day, from its `ZI` and `DA`: `91026` is 2026-10-09. */
function readRef(ref: string): { number: number; day: string } | undefined {
  const number = /#ZI#(\d+)#/.exec(ref)?.[1]
  const day = /#DA#(\d{5,6})#/.exec(ref)?.[1]
  if (!number || !day) return undefined
  const dd = day.slice(0, -4).padStart(2, '0')
  return { number: Number(number), day: `20${day.slice(-2)}-${day.slice(-4, -2)}-${dd}` }
}

/** The `journeyDetail` answer for a reference at a moment, or undefined for one it doesn't know. */
export function journeyDetail(
  settings: SimulationSettings,
  ref: string,
  now: number,
): JourneyDetailAnswer | undefined {
  const known = readRef(ref)
  if (!known) return undefined
  const trip = simulatedDay(settings, known.day).byNumber.get(known.number)
  if (!trip) return undefined
  const { timetable } = settings
  const simulated = simulateTrip(settings, trip, now)
  const realtime = !isIntervalLine(trip) && !simulated.cancelled
  const messages = tripMessages(settings, simulated, now)
  const { vehicle } = simulated
  return {
    Stops: { Stop: journeyStops(timetable, simulated, realtime) },
    ref: journeyRef(timetable, trip, simulated.journeyNumber),
    dayOfOperation: trip.serviceDay,
    // A quiet trip's position is as unknown here as in `journeyPos`.
    ...(vehicle &&
      realtime &&
      !simulated.quiet && { lastPos: { lat: vehicle.point[0], lon: vehicle.point[1] } }),
    Product: [productOf(trip, simulated.journeyNumber)],
    ...(messages.length > 0 && { Messages: { Message: messages } }),
    JourneyStatus: journeyStatus(simulated),
    reachable: !simulated.cancelled,
    ...(simulated.cancelled && { cancelled: true }),
    ...envelope(now, timetable.manifest.timezone),
  }
}
