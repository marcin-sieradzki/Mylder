// The SIRI-ET reader (spec #146): takes Dataudveksleren's SIRI-ET messages one by one and gives the
// update table at any moment. Independent of AMQP and of where it runs, so the listener and the
// tracker's recording mode both feed it.
//
// A message carries only some of a journey's calls, so each message's calls merge into what the
// reader holds for the journey, a call replacing the one it held at the same stop and aimed time;
// a message never replaces the journey. The reader holds every journey it hears of, since a later
// message may bring a call inside the box, and the table lists those that call inside it.
import { addDays } from '../timetable/dates.ts'
import { platformId } from '../timetable/stops.ts'
import { calendarDay } from '../timetable/time.ts'
import { readSiriEt, type SiriCall } from './siri.ts'
import {
  TABLE_VERSION,
  type CallRef,
  type DatasetCounts,
  type DelayStep,
  type TableJourney,
  type UpdateTable,
} from './table.ts'

/** One message as the broker delivers it: its dataset, when it was received, and its body. */
export interface SiriEtMessage {
  readonly dataset: string
  readonly receivedAt: number
  readonly body: string
}

/** The stops inside the box, without leading zeros, from one timetable version. */
export interface ReaderBox {
  readonly stops: ReadonlySet<string>
  readonly timetableVersion: string
  /** The timetable's zone, in which service days are counted. */
  readonly timezone: string
}

export interface ReaderLimits {
  /** Journeys held at once; past it, the one updated longest ago is dropped. */
  readonly journeys: number
  /** A message body longer than this many characters is skipped. */
  readonly messageChars: number
}

/** Room for a weekday's journeys on all four datasets, and four times the largest message seen. */
export const READER_LIMITS: ReaderLimits = { journeys: 20_000, messageChars: 4_000_000 }

/** A journey leaves the reader this long after its last call. */
export const FINISHED_AFTER = 10 * 60_000

export interface ReaderOptions {
  readonly box: ReaderBox
  readonly listener: { readonly version: string; readonly startedAt: number }
  readonly limits?: Partial<ReaderLimits>
}

export interface SiriEtReader {
  receive(message: SiriEtMessage): void
  /** The update table at `now`, after dropping the journeys that have finished by then. */
  table(now: number): UpdateTable
}

/** A dataset's counts as the reader keeps adding to them. */
type Counts = { -readonly [K in keyof DatasetCounts]: DatasetCounts[K] }

interface HeldCall {
  readonly stop: string
  readonly aimed: number
  /** Seconds late, when the call has an expected time. */
  readonly delay: number | undefined
  readonly cancelled: boolean
  /** When the call is expected, or else aimed: its arrival, or its departure at the first. */
  readonly at: number
}

interface HeldJourney {
  readonly dataset: string
  readonly day: string
  readonly journey: string
  line: string
  operator: string | undefined
  origin: string
  destination: string
  trainNumber: string | undefined
  received: number
  cancelled: boolean
  /** By stop and aimed time, in the order first heard. */
  readonly calls: Map<string, HeldCall>
}

export function siriEtReader({ box, listener, limits }: ReaderOptions): SiriEtReader {
  const { journeys: maxJourneys, messageChars } = { ...READER_LIMITS, ...limits }
  // A Map keeps its order of insertion: each update moves its journey to the end, so the first
  // is always the one updated longest ago.
  const held = new Map<string, HeldJourney>()
  const datasets = new Map<string, Counts>()
  let lastMessageAt: number | undefined
  let evicted = 0

  function receive({ dataset, receivedAt, body }: SiriEtMessage) {
    const counts = countsOf(dataset, receivedAt)
    counts.messages++
    counts.lastMessageAt = receivedAt
    lastMessageAt = Math.max(lastMessageAt ?? receivedAt, receivedAt)
    if (body.length > messageChars) {
      counts.tooLarge++
      return
    }
    const journeys = readSiriEt(body)
    if (!journeys) {
      counts.malformed++
      return
    }
    for (const update of journeys) {
      const { day, journey, line, origin, destination } = update
      if (!day || !journey || !line || !origin || !destination) {
        counts.skippedJourneys++
        continue
      }
      counts.journeyUpdates++
      const key = `${dataset} ${day} ${journey}`
      const before = held.get(key)
      const into: HeldJourney = before ?? {
        dataset,
        day,
        journey,
        line,
        operator: undefined,
        origin,
        destination,
        trainNumber: undefined,
        received: receivedAt,
        cancelled: false,
        calls: new Map(),
      }
      into.line = line
      into.origin = origin
      into.destination = destination
      into.operator = update.operator ?? into.operator
      into.trainNumber = update.trainNumber ?? into.trainNumber
      into.received = Math.max(into.received, receivedAt)
      into.cancelled = update.cancelled
      for (const call of update.calls) {
        const kept = heldCall(call)
        if (kept) {
          const at = `${kept.stop} ${kept.aimed}`
          into.calls.delete(at)
          into.calls.set(at, kept)
        }
      }
      held.delete(key)
      held.set(key, into)
    }
    while (held.size > maxJourneys) {
      held.delete(held.keys().next().value!)
      evicted++
    }
  }

  function countsOf(dataset: string, at: number): Counts {
    let counts = datasets.get(dataset)
    if (!counts) {
      counts = {
        lastMessageAt: at,
        messages: 0,
        journeyUpdates: 0,
        malformed: 0,
        tooLarge: 0,
        skippedJourneys: 0,
      }
      datasets.set(dataset, counts)
    }
    return counts
  }

  function table(now: number): UpdateTable {
    const firstDay = addDays(calendarDay(now, box.timezone), -1)
    const journeys: TableJourney[] = []
    for (const [key, journey] of held) {
      const calls = inOrder(journey.calls)
      const last = calls[calls.length - 1]
      const finished = last ? now >= last.at + FINISHED_AFTER : journey.day < firstDay
      if (finished || journey.day < firstDay) {
        held.delete(key)
        continue
      }
      if (callsInBox(journey, calls)) journeys.push(tableJourney(journey, calls))
    }
    return {
      version: TABLE_VERSION,
      writtenAt: now,
      ...(lastMessageAt !== undefined && { lastMessageAt }),
      listener: { version: listener.version, startedAt: listener.startedAt },
      timetableVersion: box.timetableVersion,
      datasets: Object.fromEntries([...datasets].map(([name, counts]) => [name, { ...counts }])),
      held: held.size,
      evicted,
      journeys,
    }
  }

  function callsInBox(journey: HeldJourney, calls: readonly HeldCall[]): boolean {
    return (
      box.stops.has(platformId(journey.origin)) ||
      box.stops.has(platformId(journey.destination)) ||
      calls.some((call) => box.stops.has(platformId(call.stop)))
    )
  }

  return { receive, table }
}

/** A call the reader can place: one with a stop and an aimed time. */
function heldCall(call: SiriCall): HeldCall | undefined {
  const aimed = call.aimedDeparture ?? call.aimedArrival
  if (!call.stop || aimed === undefined) return undefined
  const delay =
    call.expectedDeparture !== undefined && call.aimedDeparture !== undefined
      ? call.expectedDeparture - call.aimedDeparture
      : call.expectedArrival !== undefined && call.aimedArrival !== undefined
        ? call.expectedArrival - call.aimedArrival
        : undefined
  return {
    stop: call.stop,
    aimed,
    delay: delay === undefined ? undefined : Math.round(delay / 1000),
    cancelled: call.cancelled,
    at: call.expectedArrival ?? call.expectedDeparture ?? call.aimedArrival ?? aimed,
  }
}

/** Held calls by aimed time, those at the same time in the order first heard. */
const inOrder = (calls: Map<string, HeldCall>): HeldCall[] =>
  [...calls.values()].sort((a, b) => a.aimed - b.aimed)

const ref = ({ stop, aimed }: HeldCall): CallRef => ({ stop, aimed })

function tableJourney(journey: HeldJourney, calls: readonly HeldCall[]): TableJourney {
  const steps: DelayStep[] = []
  const cancelledCalls: CallRef[] = []
  if (!journey.cancelled) {
    for (const call of calls) {
      if (call.cancelled) cancelledCalls.push(ref(call))
      else if (call.delay !== undefined && call.delay !== steps[steps.length - 1]?.delay) {
        steps.push({ ...ref(call), delay: call.delay })
      }
    }
  }
  return {
    dataset: journey.dataset,
    day: journey.day,
    journey: journey.journey,
    line: journey.line,
    ...(journey.operator !== undefined && { operator: journey.operator }),
    origin: journey.origin,
    destination: journey.destination,
    ...(journey.trainNumber !== undefined && { trainNumber: journey.trainNumber }),
    received: journey.received,
    ...(journey.cancelled && { cancelled: true as const }),
    ...(calls[0] && { first: ref(calls[0]) }),
    ...(cancelledCalls.length > 0 && { cancelledCalls }),
    steps,
  }
}
