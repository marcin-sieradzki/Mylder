// The page notices at a moment (docs/screens.md, "Page notices"; docs/data-states.md, "When the
// answers stop"): read from the live snapshot, how the browser's own polls are going and the
// server's clock, as codes and moments; the screen writes the words. Like the data states, the
// notices tick with the server's clock (./ticking.ts), and change only when one does.
import 'client-only'
import { useSyncExternalStore } from 'react'
import { liveLimit } from '../domain/data-state.ts'
import { pauseAt } from '../domain/pause.ts'
import { describeSource, type BannerWords } from '../domain/source.ts'
import type { IsoDate } from '../timetable/format.ts'
import type { Snapshot } from '../tracker/index.ts'
import { liveSnapshot, type LiveSnapshot, type SnapshotStore } from './live.ts'
import { tickingStore, type TickingStore } from './ticking.ts'

/** One notice, top to bottom in the order the page shows them. */
export type PageNotice =
  /**
   * The browser's own polls fail: since when, on the server's clock, and when the server received
   * the last position answer the dots move on, if the page has seen one.
   */
  | { readonly kind: 'disconnected'; readonly since: number; readonly lastData?: number }
  /** Paused because the month's calls are spent, until the date live data resumes. */
  | { readonly kind: 'paused'; readonly reason: 'spent'; readonly resumes?: string }
  /** Paused because Rejseplanen has failed or answered nothing since its last good answer. */
  | { readonly kind: 'paused'; readonly reason: 'no-answer'; readonly since: number }
  /** The poll has stretched to this many seconds to stay within the month's budget. */
  | { readonly kind: 'budget'; readonly pollInterval: number }
  /** The prepared timetable has under 7 days of service left, or none: its last covered day. */
  | { readonly kind: 'timetable'; readonly last: IsoDate; readonly ended: boolean }
  /**
   * Where the page's data comes from, when it isn't Rejseplanen's own live data, by the words of
   * the source's description; `fetched`, when the banner is dated, is when the snapshot was built,
   * which names a recording's day.
   */
  | { readonly kind: 'source'; readonly words: BannerWords; readonly fetched?: number }

/** The notices, top to bottom. */
export type PageNotices = readonly PageNotice[]

const NONE: PageNotices = []

/** The source banner its description gives, whenever the data isn't Rejseplanen's own. */
function sourceNotice(snapshot: Snapshot): PageNotice | undefined {
  const { banner } = describeSource(snapshot.source.kind)
  if (!banner) return undefined
  const { words, dated } = banner
  return dated ? { kind: 'source', words, fetched: snapshot.fetched } : { kind: 'source', words }
}

/** Disconnected, at once, while the browser's own polls fail. */
function disconnectedNotice({ failingSince, clockOffset = 0, lastAnswer }: LiveSnapshot) {
  if (failingSince === undefined) return undefined
  return {
    kind: 'disconnected',
    since: failingSince + clockOffset,
    ...(lastAnswer === undefined ? {} : { lastData: lastAnswer }),
  } satisfies PageNotice
}

/**
 * Paused: at once when the month is spent, since the server knows; when Rejseplanen fails or
 * answers nothing, once its last good answer is older than the Live limit.
 */
function pausedNotice(snapshot: Snapshot, now: number): PageNotice | undefined {
  const pause = pauseAt(snapshot, now, liveLimit(snapshot.pollInterval, snapshot.positionMode))
  if (!pause) return undefined
  return pause.reason === 'spent'
    ? { kind: 'paused', reason: 'spent', ...(pause.resumes ? { resumes: pause.resumes } : {}) }
    : { kind: 'paused', reason: 'no-answer', since: pause.since }
}

/**
 * The budget line, while the poll has stretched past a minute, as the screens' budget line
 * (src/screens/budget.ts); a spent month says so in Paused instead.
 */
function budgetNotice({ budget, pollInterval }: Snapshot) {
  if (budget.level === 'spent' || pollInterval <= 60) return undefined
  return { kind: 'budget', pollInterval } satisfies PageNotice
}

/**
 * The timetable notice, while the snapshot says its timetable is running out, with the last day
 * its window covers and whether that day is over.
 */
function timetableNotice({ timetableRunningOut, status }: Snapshot) {
  if (!timetableRunningOut) return undefined
  const { last, daysLeft } = status.timetable
  return { kind: 'timetable', last, ended: daysLeft === 0 } satisfies PageNotice
}

/** The notices `live` gives at `now`, on the server's clock. */
export function noticesAt(live: LiveSnapshot, now: number): PageNotices {
  const { snapshot } = live
  const list = [
    disconnectedNotice(live),
    snapshot && pausedNotice(snapshot, now),
    snapshot && budgetNotice(snapshot),
    snapshot && timetableNotice(snapshot),
    snapshot && sourceNotice(snapshot),
  ].filter((notice) => notice !== undefined)
  return list.length === 0 ? NONE : list
}

/** Two notices alike: each is one flat record of codes and moments. */
const sameNotice = (a: PageNotice, b: PageNotice) => {
  const [these, those] = [a, b] as Record<string, unknown>[]
  const keys = Object.keys(these)
  return keys.length === Object.keys(those).length && keys.every((key) => these[key] === those[key])
}

const same = (a: PageNotices, b: PageNotices) =>
  a.length === b.length && a.every((notice, i) => sameNotice(notice, b[i]))

/** The page notices now, ticking by the server's clock. */
export type PageNoticesStore = TickingStore<PageNotices>

/** The notices of the snapshots `live` holds. */
export const pageNoticesStore = (live: SnapshotStore = liveSnapshot): PageNoticesStore =>
  tickingStore(noticesAt, same, live)

/** The page's one store of notices, from the page's live snapshot. */
export const pageNotices = pageNoticesStore()

/**
 * How long past its poll interval the snapshot may be before the Updated line says so: the
 * browser asks for the next one up to 4 s after it is due, and again 5 s later while the server's
 * isn't new yet (poll.ts), so the line doesn't blink at every poll.
 */
export const OUT_OF_DATE_GRACE = 10_000

/**
 * Whether the snapshot `live` holds may be out of date at `now` (docs/screens.md, "Source
 * lines"): older than its poll interval, by the server's clock. While the page is Disconnected or
 * Paused its page notice says so instead.
 */
export function outOfDateAt(live: LiveSnapshot, now: number): boolean {
  const { snapshot, failingSince } = live
  if (!snapshot || failingSince !== undefined || pausedNotice(snapshot, now)) return false
  return now - snapshot.fetched > snapshot.pollInterval * 1000 + OUT_OF_DATE_GRACE
}

/** Whether the snapshot may be out of date now, ticking by the server's clock. */
export const outOfDate: TickingStore<boolean> = tickingStore(outOfDateAt, Object.is, liveSnapshot)

/** Whether the snapshot may be out of date now, for the Updated line. */
export function useOutOfDate(store: TickingStore<boolean> = outOfDate): boolean {
  return useSyncExternalStore(store.subscribe, store.get, () => false)
}

const isPaused = (notices: PageNotices): boolean =>
  notices.some((notice) => notice.kind === 'paused')

/** Whether the page is Paused now, for the Updated line: it renders again only when that flips. */
export function usePaused(store: PageNoticesStore = pageNotices): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => isPaused(store.get()),
    () => false,
  )
}

/** The page notices now, for a component: it renders again when one changes. */
export function usePageNotices(store: PageNoticesStore = pageNotices): PageNotices {
  return useSyncExternalStore(store.subscribe, store.get, () => NONE)
}
