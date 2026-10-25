// The API's health in the snapshot (docs/live-data.md, "What can go wrong"): ok, empty, error with
// its kind, or spent, with the moment it began. The data-state rules read it, so five minutes of
// anything but ok turn every trip with realtime No signal.
import 'server-only'
import type { CallError } from './rejseplanen/client.ts'
import type { Snapshot } from './snapshot.ts'

/**
 * An answer with no trips is `empty` only while the timetable expects at least this many
 * underway in the box; below it, at night, an empty answer is ok.
 */
export const EMPTY_ANSWER_MIN_UNDERWAY = 50

/** How a run's call went, before it has a start time. */
export interface Outcome {
  readonly status: Snapshot['api']['status']
  readonly kind?: CallError['kind']
}

/** How an answer went: empty if it carries no trip when the timetable expects plenty, else ok. */
export function answerOutcome(journeys: number, expectedUnderway: number): Outcome {
  return journeys === 0 && expectedUnderway >= EMPTY_ANSWER_MIN_UNDERWAY
    ? { status: 'empty' }
    : { status: 'ok' }
}

/** How a failed call went: a refused key or a spent month is `spent`, the rest `error`. */
export function failureOutcome(error: CallError): Outcome {
  return error.kind === 'quota' || error.kind === 'refused'
    ? { status: 'spent', kind: error.kind }
    : { status: 'error', kind: error.kind }
}

/** The health an outcome gives, keeping the start of a health that carries on. */
export function healthAfter(
  previous: Snapshot['api'] | undefined,
  outcome: Outcome,
  now: number,
): Snapshot['api'] {
  const since = previous && previous.status === outcome.status ? previous.since : now
  return { status: outcome.status, since, ...(outcome.kind ? { kind: outcome.kind } : {}) }
}
