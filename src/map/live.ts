// The page's live snapshot: the latest snapshot the poll landed, the server's clock and how the
// poll is going, in one store that React reads through `useSyncExternalStore` and the map's
// canvas subscribes to outside React (docs/live-data.md, "The browser").
import 'client-only'
import { useSyncExternalStore } from 'react'
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
}

export interface SnapshotStore {
  get(): LiveSnapshot
  /** Replaces what changed and tells every subscriber. */
  update(change: Partial<LiveSnapshot>): void
  /** Calls back on every change; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

const NOTHING_YET: LiveSnapshot = { clockOffset: 0 }

/** A store holding nothing yet. Each change makes a new state, so React sees it changed. */
export function snapshotStore(): SnapshotStore {
  let state = NOTHING_YET
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    update(change) {
      state = { ...state, ...change }
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
