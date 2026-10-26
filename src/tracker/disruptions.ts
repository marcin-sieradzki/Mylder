// The disruption list (docs/live-data.md, "One call a minute", step 4; docs/screens.md,
// "Disruptions"): `himsearch`'s messages that belong to Copenhagen, as received, each with the
// kind its fields say and its validity as moments, kept in the store between fetches with when it
// was fetched and last checked. The kind a card names and whether it is active or Later depend
// on the clock, so the browser reads them with `src/domain/disruption.ts`. Plain functions; the
// run in `tracker.ts` decides when to fetch.
import 'server-only'
import { createHash } from 'node:crypto'
import type { Disruption as DisruptionRule, DisruptionKind } from '../domain/disruption.ts'
import type { Stops } from '../timetable/stops.ts'
import { clockMoment } from '../timetable/time.ts'
import type { Message } from './rejseplanen/answers.ts'
import type { Snapshot } from './snapshot.ts'

/**
 * The one table that reads a message's kind from its fields, first match wins. Empty until the
 * first real answers show what each `category` and `priority` mean (`himsearch` sends no icon
 * field we decode yet); until then every message's fields say Service notice.
 */
const KIND_RULES: readonly {
  readonly category?: string
  readonly priority?: number
  readonly kind: DisruptionKind
}[] = []

/** One message as Rejseplanen sent it, with its fields' kind and its validity. */
export interface Disruption extends DisruptionRule {
  readonly message: Message
}

/** The list between fetches, as the store keeps it and the route serves it. */
export interface DisruptionList {
  /** When the list was last fetched, or null when no fetch has worked yet. */
  readonly fetched: number | null
  /** When it was last asked for, and whether that worked. */
  readonly checked: number
  readonly ok: boolean
  readonly version: string
  /** How many messages the last answer held, Copenhagen's or not: at 100 it may be cut short. */
  readonly received: number
  readonly messages: readonly Disruption[]
}

/** What makes a message Copenhagen's: Mylder's stops, the products it asks for, the zone. */
export interface Area {
  readonly stops: Stops
  readonly products: number
  readonly timezone: string
}

/**
 * Whether a message belongs to Copenhagen: it names a stop in Mylder's stop set, or names no
 * stops and its products overlap the ones Mylder asks for. One that gives no products is kept.
 */
export function inArea(message: Message, { stops, products }: Area): boolean {
  const named = [
    ...(message.affectedStops?.StopLocation ?? []),
    ...(message.validFromStop ? [message.validFromStop] : []),
    ...(message.validToStop ? [message.validToStop] : []),
  ]
  if (named.length > 0) return named.some(({ extId }) => stops.stopForPlatform(extId) !== undefined)
  return message.products === undefined || (message.products & products) !== 0
}

/** A message's kind from its structured fields only: what the table says, else a service notice. */
export function fieldsKindOf(message: Message): DisruptionKind {
  const rule = KIND_RULES.find(
    ({ category, priority }) =>
      (category === undefined || category === message.category) &&
      (priority === undefined || priority === message.priority),
  )
  return rule?.kind ?? 'service-notice'
}

/** A short fingerprint of the messages, which changes whenever any of them does. */
const versionOf = (messages: readonly Message[]) =>
  createHash('sha256').update(JSON.stringify(messages)).digest('hex').slice(0, 12)

/** A message with its fields' kind and its validity, read in the timetable's zone. */
function disruptionOf(message: Message, timezone: string): Disruption {
  const from = clockMoment(message.sDate, message.sTime, timezone)
  const to = clockMoment(message.eDate, message.eTime, timezone)
  return {
    fieldsKind: fieldsKindOf(message),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    message,
  }
}

/** The list a fetch gives: the answer's messages that belong to Copenhagen. */
export function fetchedList(answer: readonly Message[], now: number, area: Area): DisruptionList {
  const messages = answer.filter((message) => inArea(message, area))
  return {
    fetched: now,
    checked: now,
    ok: true,
    version: versionOf(messages),
    received: answer.length,
    messages: messages.map((message) => disruptionOf(message, area.timezone)),
  }
}

/** The list after a failed fetch: the previous messages, marked as not updated at this check. */
export function failedList(previous: DisruptionList | undefined, now: number): DisruptionList {
  return previous
    ? { ...previous, checked: now, ok: false }
    : { fetched: null, checked: now, ok: false, version: versionOf([]), received: 0, messages: [] }
}

/** The list as its route serves it, with when the next fetch is due. */
export interface Disruptions extends Omit<DisruptionList, 'checked'> {
  /**
   * When the list was last asked for, or null before the first check, when `ok` is true: no
   * check has failed.
   */
  readonly checked: number | null
  readonly nextDue: number
}

/** When the list is next fetched, `every` minutes after it was last asked for. */
const nextFetch = (list: DisruptionList, every: number) => list.checked + every * 60_000

/** Whether a run should fetch: on the first, and then every `every` minutes, never without one. */
export function fetchDue(
  list: DisruptionList | undefined,
  now: number,
  every: number | undefined,
): boolean {
  if (every === undefined) return false
  return !list || now >= nextFetch(list, every)
}

/**
 * The list the route serves: the stored one, due again at its next fetch, or an empty one before
 * the first. With no fetch to come, it is due with the snapshot, `otherwise`.
 */
export function servedList(
  list: DisruptionList | undefined,
  every: number | undefined,
  otherwise: number,
): Disruptions {
  if (!list) {
    return { ...failedList(undefined, 0), checked: null, ok: true, nextDue: otherwise }
  }
  return { ...list, nextDue: every === undefined ? otherwise : nextFetch(list, every) }
}

/** The list's state as the snapshot carries it. */
export const summaryOf = (list: DisruptionList | undefined): Snapshot['disruptions'] =>
  list
    ? {
        fetched: list.fetched,
        checked: list.checked,
        ok: list.ok,
        count: list.messages.length,
        version: list.version,
      }
    : null
