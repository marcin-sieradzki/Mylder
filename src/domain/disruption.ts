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
