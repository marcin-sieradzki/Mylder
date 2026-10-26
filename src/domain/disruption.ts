// A disruption's kind and phase, as docs/screens.md ("Disruptions", "A card") gives them. The
// server keeps the kind a message's fields say and its validity as moments, the same at every
// moment between fetches; the browser reads the kind its card names and whether it is active or
// Later from these two functions and the clock. Times are milliseconds since the epoch.

/** The kinds a disruption card names. */
export type DisruptionKind =
  'delays' | 'diversion' | 'planned-works' | 'data-feed' | 'service-notice'

/** Active now, or under "Later": starting within the next 7 days. */
export type DisruptionPhase = 'active' | 'later'

/** What the rule reads of one of Rejseplanen's messages. */
export interface DisruptionFacts {
  /** The kind its structured fields say, or Service notice when they say none. */
  readonly fieldsKind: DisruptionKind
  /** Its validity, when Rejseplanen gives it. */
  readonly from?: number
  readonly to?: number
  /** Rejseplanen's own active flag, which decides only when it gives no times. */
  readonly act?: boolean
}

const DAY = 24 * 3600_000

/** A message that runs longer than this is Planned works, whatever its fields say. */
const PLANNED_LONGER_THAN = DAY

/** How far ahead "Later" looks. */
const LATER_WITHIN = 7 * DAY

/**
 * The kind its card names: Planned works when it starts after now (or, with no times, when
 * Rejseplanen flags it inactive) or spans more than a day.
 */
export function disruptionKind(disruption: DisruptionFacts, now: number): DisruptionKind {
  const { from, to } = disruption
  if (from !== undefined && from > now) return 'planned-works'
  if (from === undefined && to === undefined && disruption.act === false) return 'planned-works'
  if (from !== undefined && to !== undefined && to - from > PLANNED_LONGER_THAN) {
    return 'planned-works'
  }
  return disruption.fieldsKind
}

/**
 * Whether it is listed now, and where: active from its start until its end, Later when it starts
 * within the next 7 days, else not at all. With no times, Rejseplanen's flag decides, and a
 * message it flags inactive goes under Later.
 */
export function disruptionPhase(
  disruption: DisruptionFacts,
  now: number,
): DisruptionPhase | undefined {
  const { from, to } = disruption
  if (from === undefined && to === undefined) {
    return disruption.act === false ? 'later' : 'active'
  }
  if (to !== undefined && now >= to) return undefined
  if (from === undefined || from <= now) return 'active'
  return from - now <= LATER_WITHIN ? 'later' : undefined
}

/** A listed disruption with the kind its card names. */
export interface Listed<D extends DisruptionFacts> {
  readonly disruption: D
  readonly kind: DisruptionKind
}

/** The disruption list as the route serves it: when it was fetched and checked, and its messages. */
export interface ListFacts<D extends DisruptionFacts> {
  /** When the last good answer came, or null when none has. */
  readonly fetched: number | null
  /** When it was last asked for, or null before the first check. */
  readonly checked: number | null
  /** Whether the last check worked. */
  readonly ok: boolean
  /** How many messages the answer held, Copenhagen's or not. */
  readonly received: number
  readonly messages: readonly D[]
}

/** The list as the Disruptions screen reads it at a moment. */
export interface ListReading<D extends DisruptionFacts> {
  /** Active ones, newest start first. */
  readonly active: readonly Listed<D>[]
  /** Later ones, by start. */
  readonly later: readonly Listed<D>[]
  /** Nothing is active, the last check worked and the list is up to date: said once. */
  readonly runningNormally: boolean
  readonly lastCheckFailed: boolean
  /** More than an hour since the last good answer, as when a spent month makes no calls. */
  readonly outOfDate: boolean
  /** Rejseplanen sends at most this many, so a full answer may be cut short. */
  readonly mayBeIncomplete: boolean
}

/** Minutes between the list's checks at each budget level; none once the month is spent. */
const CHECKED_EVERY = { normal: 15, stretched: 15, tight: 30, spent: undefined } as const

/** How often the list is checked at a budget level, in minutes, or undefined when it is not. */
export const checkedEvery = (level: keyof typeof CHECKED_EVERY): number | undefined =>
  CHECKED_EVERY[level]

/** The most messages one `himsearch` answer holds. */
export const MAX_MESSAGES = 100

/** How long a good answer counts as up to date. */
const UP_TO_DATE_FOR = 3600_000

/**
 * The list at a moment: active ones newest first, then Later by start, each with its card's kind.
 * Active ones sort by start until the first day shows whether priority orders them.
 */
export function readList<D extends DisruptionFacts>(
  list: ListFacts<D>,
  now: number,
): ListReading<D> {
  const active: Listed<D>[] = []
  const later: Listed<D>[] = []
  for (const disruption of list.messages) {
    const phase = disruptionPhase(disruption, now)
    const listed = { disruption, kind: disruptionKind(disruption, now) }
    if (phase === 'active') active.push(listed)
    else if (phase === 'later') later.push(listed)
  }
  const start = ({ disruption }: Listed<D>) => disruption.from ?? -Infinity
  active.sort((a, b) => start(b) - start(a))
  later.sort((a, b) => start(a) - start(b))
  const outOfDate = list.fetched !== null && now - list.fetched > UP_TO_DATE_FOR
  return {
    active,
    later,
    runningNormally: active.length === 0 && list.ok && list.checked !== null && !outOfDate,
    lastCheckFailed: !list.ok,
    outOfDate,
    mayBeIncomplete: list.received === MAX_MESSAGES,
  }
}
