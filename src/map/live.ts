// The page's live snapshot: the latest snapshot the poll landed, the server's clock and how the
// poll is going, in one store that React reads through `useSyncExternalStore` and the map's
// canvas subscribes to outside React (docs/live-data.md, "The browser").
import 'client-only'
import { useSyncExternalStore } from 'react'
import { lastAnswer } from '../domain/pause.ts'
import type { Snapshot } from '../tracker/index.ts'
import { snapshotPoller } from './poll.ts'

export interface LiveSnapshot {
  /** The latest snapshot, kept through failed polls; none until the first lands. */
  readonly snapshot?: Snapshot
  /** The server's clock minus this device's, in ms, from the latest answer's date header. */
  readonly clockOffset: number
  /** When the latest poll that answered landed, on this device's clock. */
  readonly lastGoodPoll?: number
  /** Since when polls have failed, on this device's clock; unset once one answers. */
  readonly failingSince?: number
  /**
   * When the server received the latest position answer this page has seen, on the server's
   * clock: the latest of each landed snapshot's last answer (src/domain/pause.ts), so it never
   * counts up and holds through snapshots built from none. The store keeps it itself.
   */
  readonly lastAnswer?: number
}

export interface SnapshotStore {
  get(): LiveSnapshot
  /** Replaces what changed and tells every subscriber. */
  update(change: Partial<Omit<LiveSnapshot, 'lastAnswer'>>): void
  /** Calls back on every change; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

const NOTHING_YET: LiveSnapshot = { clockOffset: 0 }

/** The server's time now, by this device's clock and the offset the latest answer gave. */
export const serverNow = ({ clockOffset }: Pick<LiveSnapshot, 'clockOffset'>): number =>
  Date.now() + clockOffset

/** The latest answer time once `state`'s snapshot has landed; none once it is cleared. */
function lastAnswerOf({ snapshot, lastAnswer: before }: LiveSnapshot): number | undefined {
  if (!snapshot) return undefined
  const its = lastAnswer(snapshot)
  return its === undefined || (before !== undefined && before > its) ? before : its
}

/** A store holding nothing yet. Each change makes a new state, so React sees it changed. */
export function snapshotStore(): SnapshotStore {
  let state = NOTHING_YET
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    update(change) {
      state = { ...state, ...change }
      if ('snapshot' in change) state = { ...state, lastAnswer: lastAnswerOf(state) }
      for (const listener of listeners) listener()
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one store, filled by the page's one poll. */
export const liveSnapshot = snapshotStore()

let pagePoller: ReturnType<typeof snapshotPoller> | undefined
let users = 0

/**
 * Starts the page's poll if it isn't running, for as long as anything on the page needs it.
 * Returns the function that says it is no longer needed. Its jitter is drawn once per page load.
 */
export function pollSnapshot(): () => void {
  pagePoller ??= snapshotPoller(liveSnapshot)
  if (users++ === 0) pagePoller.start()
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    if (--users === 0) pagePoller?.stop()
  }
}

/** The live snapshot, for a component: it renders again when the store changes. */
export function useLiveSnapshot(store: SnapshotStore = liveSnapshot): LiveSnapshot {
  return useSyncExternalStore(store.subscribe, store.get, () => NOTHING_YET)
}

/**
 * The server's clock minus this device's, for a component that reads the server's time: it
 * renders again only when an answer moves it.
 */
export function useClockOffset(store: SnapshotStore = liveSnapshot): number {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().clockOffset,
    () => NOTHING_YET.clockOffset,
  )
}

/**
 * The server's clock when the latest poll that answered landed, for a component that reads a
 * moment once a minute or so: it renders again only when a poll lands. None before the first.
 */
export function usePollMoment(store: SnapshotStore = liveSnapshot): number | undefined {
  const moment = ({ lastGoodPoll, clockOffset }: LiveSnapshot) =>
    lastGoodPoll === undefined ? undefined : lastGoodPoll + clockOffset
  return useSyncExternalStore(
    store.subscribe,
    () => moment(store.get()),
    () => undefined,
  )
}

/**
 * The latest snapshot alone, for a component that shows nothing of how the poll is going: it
 * renders again only when a snapshot lands.
 */
export function useSnapshot(store: SnapshotStore = liveSnapshot): Snapshot | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().snapshot,
    () => undefined,
  )
}

/**
 * When the server received the latest position answer this page has seen, for the Updated line:
 * it renders again only when that moves.
 */
export function useLastAnswer(store: SnapshotStore = liveSnapshot): number | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().lastAnswer,
    () => undefined,
  )
}
