// The simulated disruption messages: the scenario's, placed on the calendar around the moment,
// for `himsearch` and for the trips they touch in `journeyDetail`.
import 'server-only'
import { addDays, weekday } from '../../timetable/dates.ts'
import type { IsoDate } from '../../timetable/format.ts'
import type { Message } from '../rejseplanen/answers.ts'
import { atClock, dateAndTime, platformsOfStops, productClass, stopLocation } from './journeys.ts'
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

/**
 * The scenario's messages, each placed in the day or week of the moment, or in the one before
 * while that one still runs, such as a multi-day diversion before its first morning's start.
 */
function placed({ scenario, timetable }: SimulationSettings, now: number): PlacedMessage[] {
  const { timezone } = timetable.manifest
  const [today] = dateAndTime(now, timezone)
  const moment = (start: IsoDate, { day, time }: DayTime) =>
    atClock(addDays(start, day), time, timezone)
  return scenario.messages.map((message) => {
    const length = message.every === 'week' ? 7 : 1
    const current = addDays(today, message.every === 'week' ? -weekday(today) : 0)
    const before = addDays(current, -length)
    const start = moment(before, message.to) > now ? before : current
    return {
      message,
      from: moment(start, message.from),
      to: moment(start, message.to),
      platforms: platformsOfStops(timetable, message.stops),
    }
  })
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
