// Each vehicle's data state now, by the clock: the domain's rule (src/domain/data-state.ts) run
// again in the browser from each trip's fields and the snapshot's, at the server's time, so a
// Live dot turns Ageing and a silent city No signal on the second, with no poll
// (docs/live-data.md, "What ages where"). It ticks with the server's clock (./ticking.ts) and
// changes only when a state does, so the canvas rebuilds its glyphs and React renders again only
// then.
import 'client-only'
import { useSyncExternalStore } from 'react'
import {
  dataState,
  updatesContext,
  type DataState,
  type DataStateContext,
} from '../domain/data-state.ts'
import type { Snapshot } from '../tracker/index.ts'
import { liveSnapshot, type SnapshotStore } from './live.ts'
import { sameByKey, tickingStore, type TickingStore } from './ticking.ts'

/** Each drawn trip's data state, by its key. */
export type DataStates = ReadonlyMap<string, DataState>

/** The data states now, ticking by the server's clock. */
export type DataStatesStore = TickingStore<DataStates>

const NONE: DataStates = new Map()

/** Every trip's state in `snapshot` at `now`. */
export function statesAt(snapshot: Snapshot, now: number): DataStates {
  const context: DataStateContext = {
    now,
    fetched: snapshot.fetched,
    pollInterval: snapshot.pollInterval,
    positionMode: snapshot.positionMode,
    health: snapshot.api,
    // With SIRI-ET's feed on, whether it is fresh is judged by the clock here too.
    ...updatesContext(snapshot.updates),
  }
  return new Map(snapshot.trips.map((trip) => [trip.key, dataState(trip, context)]))
}

/** The states of the snapshots `live` holds. */
export const dataStatesStore = (live: SnapshotStore = liveSnapshot): DataStatesStore =>
  tickingStore(({ snapshot }, now) => (snapshot ? statesAt(snapshot, now) : NONE), sameByKey, live)

/** The page's one store of states, from the page's live snapshot. */
export const dataStates = dataStatesStore()

/**
 * One trip's data state now, for a component such as its card: it renders again only when that
 * one changes. None for a trip the snapshot doesn't carry.
 */
export function useDataState(
  key: string,
  store: DataStatesStore = dataStates,
): DataState | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().get(key),
    () => undefined,
  )
}

/** Each drawn trip's data state now, for a component: it renders again when one changes. */
export function useDataStates(store: DataStatesStore = dataStates): DataStates {
  return useSyncExternalStore(store.subscribe, store.get, () => NONE)
}
