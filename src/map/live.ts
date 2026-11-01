// The page's live snapshots: the latest snapshot a poll landed, the server's clock and how the
// poll is going, in a store that React reads through `useSyncExternalStore` and the map's canvas
// subscribes to outside React (docs/live-data.md, "The browser"). Each kind of snapshot has a
// store of its own, filled by its own poll and on its own server's clock; the transit snapshot's
// also keeps its last answer.
import 'client-only'
import { useSyncExternalStore } from 'react'
import { lastAnswer } from '../domain/pause.ts'
import { describeSource, type SourceDescription } from '../domain/source.ts'
import type { Snapshot } from '../tracker/index.ts'
import { pagePoll, snapshotPoller, snapshotRoute } from './poll.ts'

/** What a store holds of one kind of snapshot, `S`. */
export interface LiveState<S> {
  /** The latest snapshot, kept through failed polls; none until the first lands. */
  readonly snapshot?: S
  /**
   * The server's clock minus this device's, in ms, from the latest answer's date header; none
   * until an answer has given it, while this device's own clock may be far from the server's.
   */
  readonly clockOffset?: number
  /** When the latest poll that answered landed, on this device's clock. */
  readonly lastGoodPoll?: number
  /** Since when polls have failed, on this device's clock; unset once one answers. */
  readonly failingSince?: number
  /** Set when the route is off on the server, so no snapshot will come. */
  readonly off?: true
}

/** A store of one kind of snapshot, whose state `L` may keep more than its poll gives it. */
export interface LiveStore<S, L extends LiveState<S> = LiveState<S>> {
  get(): L
  /** Replaces what changed and tells every subscriber. */
  update(change: Partial<LiveState<S>>): void
  /** Calls back on every change; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

export interface LiveSnapshot extends LiveState<Snapshot> {
  /**
   * When the server received the latest position answer this page has seen, on the server's
   * clock: the latest of each landed snapshot's last answer (src/domain/pause.ts), so it never
   * counts up and holds through snapshots built from none. The store keeps it itself.
   */
  readonly lastAnswer?: number
}

/** The transit snapshot's store. */
export type SnapshotStore = LiveStore<Snapshot, LiveSnapshot>

const NOTHING_YET: LiveSnapshot = {}

/**
 * The server's time now, by this device's clock and the offset the latest answer gave: this
 * device's own until one has.
 */
export const serverNow = ({ clockOffset = 0 }: Pick<LiveState<unknown>, 'clockOffset'>): number =>
  Date.now() + clockOffset

/** The latest answer time once `state`'s snapshot has landed; none once it is cleared. */
function lastAnswerOf({ snapshot, lastAnswer: before }: LiveSnapshot): number | undefined {
  if (!snapshot) return undefined
  const its = lastAnswer(snapshot)
  return its === undefined || (before !== undefined && before > its) ? before : its
}

/**
 * A store holding nothing yet. Each change makes a new state, so React sees it changed. `keep`
 * works out what the store keeps itself, from the state each new or cleared snapshot gives.
 */
export function liveStore<S, L extends LiveState<S> = LiveState<S>>(
  keep?: (state: L) => L,
): LiveStore<S, L> {
  let state = NOTHING_YET as L
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    update(change) {
      state = { ...state, ...change }
      if (keep && 'snapshot' in change) state = keep(state)
      for (const listener of listeners) listener()
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** A transit store holding nothing yet, which keeps the latest answer time itself. */
export const snapshotStore = (): SnapshotStore =>
  liveStore<Snapshot, LiveSnapshot>((state) => ({ ...state, lastAnswer: lastAnswerOf(state) }))

/** The page's one transit store, filled by the page's one poll of it. */
export const liveSnapshot = snapshotStore()

/**
 * Starts the page's poll of the transit snapshot if it isn't running, for as long as anything on
 * the page needs it. Returns the function that says it is no longer needed.
 */
export const pollSnapshot = pagePoll(() => snapshotPoller(liveSnapshot, snapshotRoute))

/** The live snapshot, for a component: it renders again when the store changes. */
export function useLiveSnapshot(store: SnapshotStore = liveSnapshot): LiveSnapshot {
  return useSyncExternalStore(store.subscribe, store.get, () => NOTHING_YET)
}

/**
 * The server's clock minus this device's, for a component that reads the server's time: the
 * transit snapshot's server unless another kind's store is given, such as the aircraft's; 0, this
 * device's own clock, until an answer gives it. It renders again only when an answer moves it.
 */
export function useClockOffset(store: LiveStore<unknown> = liveSnapshot): number {
  return useKnownClockOffset(store) ?? 0
}

/**
 * The server's clock minus this device's once an answer has given it, for a component that counts
 * down to a moment or says how old one is, which this device's own clock could get wrong by any
 * amount: none until then. It renders again only when an answer moves it.
 */
export function useKnownClockOffset(store: LiveStore<unknown> = liveSnapshot): number | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().clockOffset,
    () => undefined,
  )
}

/**
 * The server's clock when the latest poll that answered landed, for a component that reads a
 * moment once a minute or so: it renders again only when a poll lands. None before the first.
 */
export function usePollMoment(store: SnapshotStore = liveSnapshot): number | undefined {
  const moment = ({ lastGoodPoll, clockOffset = 0 }: LiveSnapshot) =>
    lastGoodPoll === undefined ? undefined : lastGoodPoll + clockOffset
  return useSyncExternalStore(
    store.subscribe,
    () => moment(store.get()),
    () => undefined,
  )
}

/**
 * The latest snapshot alone, for a component that shows nothing of how the poll is going: the
 * transit snapshot unless another kind's store is given, such as the aircraft's. It renders
 * again only when a snapshot lands; none until one has.
 */
export function useSnapshot(): Snapshot | undefined
export function useSnapshot<S>(store: LiveStore<S>): S | undefined
export function useSnapshot(store: LiveStore<unknown> = liveSnapshot): unknown {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().snapshot,
    () => undefined,
  )
}

/**
 * What a rider is told about the latest snapshot's source (src/domain/source.ts): whether it asks
 * Rejseplanen, has positions and brings messages, how it is named and credited, and its banner and
 * legend with SIRI-ET's delays on or off. None until a snapshot has landed.
 */
export function useSource(store: SnapshotStore = liveSnapshot): SourceDescription | undefined {
  const snapshot = useSnapshot(store)
  return snapshot && describeSnapshotSource(snapshot)
}

/**
 * Whether the latest snapshot has SIRI-ET's delays on (`MYLDER_UPDATES` set), for what credits
 * them: it renders again only when that changes. Off until a snapshot has landed.
 */
export function useDelaysOn(store: SnapshotStore = liveSnapshot): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => delaysOn(store.get().snapshot),
    () => false,
  )
}

/** Whether a snapshot has SIRI-ET's delays on. */
export const delaysOn = (snapshot: Snapshot | undefined): boolean =>
  snapshot !== undefined && snapshot.updates.kind !== 'off'

/** What a rider is told about a snapshot's source, with SIRI-ET's delays on or off. */
export const describeSnapshotSource = (snapshot: Snapshot): SourceDescription =>
  describeSource(snapshot.source.kind, { delays: delaysOn(snapshot) })

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
