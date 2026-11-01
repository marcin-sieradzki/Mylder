// Mylder's own data cards, as docs/screens.md ("Disruptions") gives them: data gaps reported in
// the Disruptions list like any other disruption, first and marked as Mylder's. Read from the
// snapshot at a moment, so a card appears and clears by the clock between polls. Times are
// milliseconds since the epoch.
import { feedFresh } from './data-state.ts'
import { callsRejseplanen, pauseAt, type PauseFacts } from './pause.ts'

/** One of Mylder's own cards, as codes and times; the screen writes the words. */
export type DataCard =
  | { readonly kind: 'paused'; readonly resumes?: string }
  | { readonly kind: 'no-answer'; readonly since: number }
  | { readonly kind: 'mode-quiet'; readonly mode: string; readonly since: number }
  /** Since the last good answer, or with no time when none has come. */
  | { readonly kind: 'messages-stale'; readonly since?: number }
  /** SIRI-ET's delays, since the feed's last message, or with no time when none has come. */
  | { readonly kind: 'updates-stale'; readonly since?: number }

/** What the cards read of a snapshot. */
export interface DataCardFacts extends PauseFacts {
  readonly disruptions: {
    readonly fetched: number | null
    readonly ok: boolean
  } | null
  readonly trips: readonly { readonly mode: string; readonly waiting?: true }[]
  /** SIRI-ET's update feed (spec #146): where updates come from, and the last message read. */
  readonly updates?: {
    readonly kind: 'off' | 'siri' | 'recording'
    readonly lastMessage?: number
  }
}

/** How long a gap lasts before it gets a card. */
const GAP = 5 * 60_000

/** How old the messages may be, after a failed check, before their card shows. */
const MESSAGES_STALE_AFTER_FAILURE = 15 * 60_000

/** How old they may be with no check failed, as when a spent month makes no calls. */
const MESSAGES_STALE_AFTER = 3600_000

/** The modes in the order the screens list them. */
const MODE_ORDER = ['metro', 's-tog', 'train', 'light-rail', 'bus']

const modeRank = (mode: string) => {
  const rank = MODE_ORDER.indexOf(mode)
  return rank < 0 ? MODE_ORDER.length : rank
}

/**
 * The cards at a moment, in order. First, on any source, the delays' card while SIRI-ET's feed is
 * on and quiet: no message for 5 min, or none yet (docs/data-states.md, rule 3). Then none on the
 * timetable source, which asks Rejseplanen nothing and so has no other gap to report: paused
 * while the month is spent; no answer once Rejseplanen has failed or answered nothing for 5 min
 * since its last good answer (./pause.ts); while it answers, one per mode with trips underway
 * whose positions stopped 5 min ago; and the messages' card once the list is more than 15 min old
 * after a failed check, or an hour old however it was checked, or has never been fetched.
 */
export function dataCards(facts: DataCardFacts, now: number): DataCard[] {
  const cards: DataCard[] = []
  const { updates } = facts
  if (updates && updates.kind !== 'off' && !feedFresh(updates.lastMessage, now)) {
    const since = updates.lastMessage
    cards.push({ kind: 'updates-stale', ...(since === undefined ? {} : { since }) })
  }
  if (!callsRejseplanen(facts)) return cards
  const { api, lastSeen, disruptions } = facts
  const pause = pauseAt(facts, now, GAP)
  if (pause?.reason === 'spent') {
    cards.push({ kind: 'paused', ...(pause.resumes ? { resumes: pause.resumes } : {}) })
  } else if (api.status !== 'ok') {
    // Every mode is quiet while it doesn't answer, so the mode cards wait until it does.
    if (pause) cards.push({ kind: 'no-answer', since: pause.since })
  } else {
    const underway = new Set(facts.trips.filter((trip) => !trip.waiting).map((trip) => trip.mode))
    const quiet = Object.entries(lastSeen)
      .filter(([mode, since]) => underway.has(mode) && now - since >= GAP)
      .sort(([a], [b]) => modeRank(a) - modeRank(b))
    for (const [mode, since] of quiet) cards.push({ kind: 'mode-quiet', mode, since })
  }
  if (disruptions) {
    const { fetched, ok } = disruptions
    if (fetched === null) {
      if (!ok) cards.push({ kind: 'messages-stale' })
    } else if (now - fetched > (ok ? MESSAGES_STALE_AFTER : MESSAGES_STALE_AFTER_FAILURE)) {
      cards.push({ kind: 'messages-stale', since: fetched })
    }
  }
  return cards
}
