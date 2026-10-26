// Mylder's own data cards, as docs/screens.md ("Disruptions") gives them: data gaps reported in
// the Disruptions list like any other disruption, first and marked as Mylder's. Read from the
// snapshot at a moment, so a card appears and clears by the clock between polls. Times are
// milliseconds since the epoch.

/** One of Mylder's own cards, as codes and times; the screen writes the words. */
export type DataCard =
  | { readonly kind: 'paused'; readonly resumes?: string }
  | { readonly kind: 'no-answer'; readonly since: number }
  | { readonly kind: 'mode-quiet'; readonly mode: string; readonly since: number }
  | { readonly kind: 'messages-stale'; readonly since: number }

/** What the cards read of a snapshot. */
export interface DataCardFacts {
  readonly api: { readonly status: 'ok' | 'empty' | 'error' | 'spent'; readonly since: number }
  readonly budget: { readonly level: string; readonly resumes?: string }
  /** By mode, when a position answer last carried one of its trips this service day. */
  readonly lastSeen: Readonly<Record<string, number>>
  readonly disruptions: {
    readonly fetched: number | null
    readonly ok: boolean
  } | null
  readonly trips: readonly { readonly mode: string; readonly waiting?: true }[]
}

/** How long a gap lasts before it gets a card. */
const GAP = 5 * 60_000

/** How old the messages may be, after a failed check, before their card shows. */
const MESSAGES_FOR = 15 * 60_000

/** The modes in the order the screens list them. */
const MODE_ORDER = ['metro', 's-tog', 'train', 'light-rail', 'bus']

const modeRank = (mode: string) => {
  const rank = MODE_ORDER.indexOf(mode)
  return rank < 0 ? MODE_ORDER.length : rank
}

/**
 * The cards at a moment, in order: paused while the month is spent; no answer once Rejseplanen
 * has failed or answered nothing for 5 min; otherwise one per mode with trips underway whose
 * positions stopped 5 min ago; and the messages' card after a failed check once the list is
 * more than 15 min old.
 */
export function dataCards(facts: DataCardFacts, now: number): DataCard[] {
  const cards: DataCard[] = []
  const { api, budget, lastSeen, disruptions } = facts
  if (budget.level === 'spent' || api.status === 'spent') {
    cards.push({ kind: 'paused', ...(budget.resumes ? { resumes: budget.resumes } : {}) })
  } else if ((api.status === 'error' || api.status === 'empty') && now - api.since >= GAP) {
    cards.push({ kind: 'no-answer', since: api.since })
  } else {
    const underway = new Set(facts.trips.filter((trip) => !trip.waiting).map((trip) => trip.mode))
    const quiet = Object.entries(lastSeen)
      .filter(([mode, since]) => underway.has(mode) && now - since >= GAP)
      .sort(([a], [b]) => modeRank(a) - modeRank(b))
    for (const [mode, since] of quiet) cards.push({ kind: 'mode-quiet', mode, since })
  }
  if (disruptions && !disruptions.ok && disruptions.fetched !== null) {
    if (now - disruptions.fetched > MESSAGES_FOR) {
      cards.push({ kind: 'messages-stale', since: disruptions.fetched })
    }
  }
  return cards
}
