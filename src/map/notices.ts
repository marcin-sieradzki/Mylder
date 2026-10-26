// The page notices at a moment (docs/screens.md, "Page notices"; docs/data-states.md, "When the
// answers stop"): read from the live snapshot, how the browser's own polls are going, the
// snapshot's timetable and the server's clock, as codes and moments; the screen writes the words.
// Like the data states, the notices tick by the server's clock while anything watches them, and
// change only when one does.
import 'client-only'
import { useSyncExternalStore } from 'react'
import { liveLimit } from '../domain/data-state.ts'
import { RUNNING_OUT_DAYS, serviceDaysLeft } from '../timetable/dates.ts'
import type { IsoDate, Manifest } from '../timetable/format.ts'
import type { Network } from '../timetable/network.ts'
import { calendarDay } from '../timetable/time.ts'
import type { Snapshot } from '../tracker/index.ts'
import { liveSnapshot, type LiveSnapshot, type SnapshotStore } from './live.ts'
import { serverNow } from './states.ts'
import { timetables, timezoneOf, type TimetableLoader } from './timetable.ts'

/** One notice, top to bottom in the order the page shows them. */
export type PageNotice =
  /**
   * The browser's own polls fail: since when, on the server's clock, and when the snapshot the
   * dots move on was built, if one has landed.
   */
  | { readonly kind: 'disconnected'; readonly since: number; readonly lastData?: number }
  /** Paused because the month's calls are spent, until the date live data resumes. */
  | { readonly kind: 'paused'; readonly reason: 'spent'; readonly resumes?: string }
  /** Paused because Rejseplanen has failed or answered nothing since a moment. */
  | { readonly kind: 'paused'; readonly reason: 'no-answer'; readonly since: number }
  /** The poll has stretched to this many seconds to stay within the month's budget. */
  | { readonly kind: 'budget'; readonly pollInterval: number }
  /** The prepared timetable has under 7 days of service left, or none: its last covered day. */
  | { readonly kind: 'timetable'; readonly last: IsoDate; readonly ended: boolean }
  | { readonly kind: 'source'; readonly source: 'simulated' }
  /** `fetched` is when the recorded snapshot was built, which names the recording's day. */
  | { readonly kind: 'source'; readonly source: 'recording'; readonly fetched: number }

export interface PageNotices {
  /** The timetable's zone, which every time in the notices is read in. */
  readonly timezone: string
  readonly list: readonly PageNotice[]
}

const NONE: PageNotices = { timezone: timezoneOf(undefined), list: [] }

/** The source banner, whenever the data isn't Rejseplanen's own. */
function sourceNotice(snapshot: Snapshot): PageNotice | undefined {
  const { kind } = snapshot.source
  if (kind === 'simulated') return { kind: 'source', source: 'simulated' }
  if (kind === 'recording')
    return { kind: 'source', source: 'recording', fetched: snapshot.fetched }
  return undefined
}

/** Disconnected, at once, while the browser's own polls fail. */
function disconnectedNotice({ snapshot, failingSince, clockOffset }: LiveSnapshot) {
  if (failingSince === undefined) return undefined
  return {
    kind: 'disconnected',
    since: failingSince + clockOffset,
    ...(snapshot ? { lastData: snapshot.fetched } : {}),
  } satisfies PageNotice
}

/**
 * Paused: at once when the month is spent, since the server knows; when Rejseplanen fails or
 * answers nothing, once its last answer is older than the Live limit.
 */
function pausedNotice({ api, budget, pollInterval, positionMode }: Snapshot, now: number) {
  if (api.status === 'spent' || budget.level === 'spent') {
    return {
      kind: 'paused',
      reason: 'spent',
      ...(budget.resumes ? { resumes: budget.resumes } : {}),
    } satisfies PageNotice
  }
  if (api.status === 'ok' || now - api.since < liveLimit(pollInterval, positionMode))
    return undefined
  return { kind: 'paused', reason: 'no-answer', since: api.since } satisfies PageNotice
}

/** The budget line, while the poll has stretched; a spent month says so in Paused instead. */
function budgetNotice({ budget, pollInterval }: Snapshot) {
  if (budget.level === 'spent' || budget.level === 'normal') return undefined
  return { kind: 'budget', pollInterval } satisfies PageNotice
}

/** The timetable notice, once its window has under 7 days of service left on today's date. */
function timetableNotice({ window, timezone }: Manifest, now: number) {
  const left = serviceDaysLeft(window.last, calendarDay(now, timezone))
  if (left >= RUNNING_OUT_DAYS) return undefined
  return { kind: 'timetable', last: window.last, ended: left === 0 } satisfies PageNotice
}

/**
 * The notices `live` gives at `now`, on the server's clock, with the snapshot's timetable once it
 * has loaded.
 */
export function noticesAt(live: LiveSnapshot, now: number, network?: Network): PageNotices {
  const { snapshot } = live
  const list: PageNotice[] = [
    disconnectedNotice(live),
    snapshot && pausedNotice(snapshot, now),
    snapshot && budgetNotice(snapshot),
    network && timetableNotice(network.manifest, now),
    snapshot && sourceNotice(snapshot),
  ].filter((notice) => notice !== undefined)
  const timezone = timezoneOf(network)
  return list.length === 0 && timezone === NONE.timezone ? NONE : { timezone, list }
}

const same = (a: PageNotices, b: PageNotices) =>
  a.timezone === b.timezone && JSON.stringify(a.list) === JSON.stringify(b.list)

export interface PageNoticesStore {
  /** The notices now; the same object until one of them changes. */
  get(): PageNotices
  /** Calls back whenever a notice changes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** The notices of the snapshots `live` holds, with their timetables from `loader`. */
export function pageNoticesStore(
  live: SnapshotStore = liveSnapshot,
  loader: TimetableLoader = timetables,
): PageNoticesStore {
  let notices = NONE
  /** The latest snapshot's timetable version, and its network once loaded. */
  let version: string | undefined
  let network: Network | undefined
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopListening: (() => void) | undefined

  // A snapshot naming another timetable loads it; until then the last one's window holds.
  const load = (wanted: string | undefined) => {
    if (wanted === undefined || wanted === version) return
    version = wanted
    loader.version(wanted).then(
      (loaded) => {
        if (version !== wanted) return
        network = loaded
        check()
      },
      () => {
        // The map logs a timetable that won't load; the next snapshot asks again.
        if (version === wanted) version = undefined
      },
    )
  }

  const get = () => {
    const now = live.get()
    const fresh = noticesAt(now, serverNow(now), network)
    if (!same(fresh, notices)) notices = fresh
    return notices
  }
  const check = () => {
    const before = notices
    if (get() !== before) for (const listener of listeners) listener()
  }
  // On each whole second of the server's clock, where the snapshot's times fall.
  const tick = () => {
    check()
    timer = setTimeout(tick, 1000 - (serverNow(live.get()) % 1000))
  }

  return {
    get,
    subscribe(onChange) {
      listeners.add(onChange)
      if (!stopListening) {
        const landed = () => {
          load(live.get().snapshot?.timetableVersion)
          check()
        }
        stopListening = live.subscribe(landed)
        load(live.get().snapshot?.timetableVersion)
        tick()
      }
      return () => {
        listeners.delete(onChange)
        if (listeners.size > 0 || !stopListening) return
        stopListening()
        stopListening = undefined
        clearTimeout(timer)
      }
    },
  }
}

/** The page's one store of notices, from the page's live snapshot. */
export const pageNotices = pageNoticesStore()

const isPaused = ({ list }: PageNotices): boolean => list.some((notice) => notice.kind === 'paused')

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
