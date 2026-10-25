// The simulated disruption messages: the scenario's, placed on the calendar around the service
// day of the moment, for `himsearch` and for the trips they touch in `journeyDetail`.
import 'server-only'
import { addDays } from '../../timetable/dates.ts'
import { wallClock } from '../../timetable/time.ts'
import type { Message } from '../rejseplanen/answers.ts'
import { dateAndTime, productClass, stopLocation } from './journeys.ts'
import type { DayTime, ScenarioMessage } from './scenarios.ts'
import type { SimulatedTrip, SimulationSettings } from './world.ts'

/** A scenario's message at a moment, with its validity as moments and its stops as platforms. */
interface PlacedMessage {
  readonly message: ScenarioMessage
  readonly from: number
  readonly to: number
  /** The platforms of its stops that the timetable has, by index. */
  readonly platforms: readonly number[]
}

/** The scenario's messages, placed around the calendar day of a moment. */
function placed({ scenario, timetable }: SimulationSettings, now: number): PlacedMessage[] {
  const { timezone } = timetable.manifest
  const [, today] = timetable.serviceDaysAt(now)
  const moment = ({ day, time }: DayTime) => {
    const [hours, minutes] = time.split(':').map(Number)
    return wallClock(addDays(today, day), hours * 3600 + minutes * 60, timezone)
  }
  const { platforms } = timetable.stops
  return scenario.messages.map((message) => ({
    message,
    from: moment(message.from),
    to: moment(message.to),
    platforms: message.stops.flatMap((id) => {
      const index = platforms.findIndex((platform) => platform.id === id)
      return index === -1 ? [] : [index]
    }),
  }))
}

function toMessage(
  settings: SimulationSettings,
  { message, from, to, platforms }: PlacedMessage,
  now: number,
): Message {
  const { timetable } = settings
  const { timezone } = timetable.manifest
  const [sDate, sTime] = dateAndTime(from, timezone)
  const [eDate, eTime] = dateAndTime(to, timezone)
  const stops = platforms.map((platform) => stopLocation(timetable, platform))
  return {
    id: message.id,
    act: from <= now && now < to,
    head: message.head,
    lead: message.lead,
    text: message.text,
    company: message.company,
    category: message.category,
    priority: message.priority,
    products: message.products,
    sDate,
    sTime,
    eDate,
    eTime,
    ...(stops.length > 0 && {
      affectedStops: { StopLocation: stops },
      validFromStop: stops[0],
      validToStop: stops.at(-1),
    }),
  }
}

/** Every message active now or later, the active ones marked `act`, in order of their start. */
export function messagesAt(settings: SimulationSettings, now: number): Message[] {
  return placed(settings, now)
    .filter(({ to }) => to > now)
    .sort((a, b) => a.from - b.from)
    .map((each) => toMessage(settings, each, now))
}

/**
 * A trip's own messages, as `journeyDetail` embeds them: those active now, for its product, that
 * name a stop it calls at, with the first and last of its calls they cover.
 */
export function tripMessages(
  settings: SimulationSettings,
  { trip }: SimulatedTrip,
  now: number,
): Message[] {
  const cls = productClass(trip.line).cls
  return placed(settings, now).flatMap((each) => {
    if (each.from > now || each.to <= now || (each.message.products & cls) === 0) return []
    const covered = trip.calls.flatMap((call, i) =>
      each.platforms.includes(call.platform) ? [i] : [],
    )
    if (covered.length === 0) return []
    return [
      { ...toMessage(settings, each, now), routeIdxFrom: covered[0], routeIdxTo: covered.at(-1) },
    ]
  })
}
