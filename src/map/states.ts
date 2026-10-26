// Each vehicle's data state now, by the clock: the domain's rule (src/domain/data-state.ts) run
// again in the browser from each trip's fields and the snapshot's, at the server's time, so a
// Live dot turns Ageing and a silent city No signal on the second, with no poll
// (docs/live-data.md, "What ages where"). It ticks each second of the server's clock while
// anything watches it, and changes only when a state does, so the canvas rebuilds its glyphs and
// React renders again only then.
import 'client-only'
import { useSyncExternalStore } from 'react'
import { dataState, type DataState, type DataStateContext } from '../domain/data-state.ts'
import type { Snapshot } from '../tracker/index.ts'
import { liveSnapshot, type LiveSnapshot, type SnapshotStore } from './live.ts'

/** Each drawn trip's data state, by its key. */
export type DataStates = ReadonlyMap<string, DataState>

export interface DataStatesStore {
  /** The states now; the same map until one of them changes. */
  get(): DataStates
  /** Calls back whenever a state changes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

const NONE: DataStates = new Map()

/** The server's time now, by this device's clock and the offset the latest answer gave. */
export const serverNow = ({ clockOffset }: LiveSnapshot): number => Date.now() + clockOffset

/** Every trip's state in `snapshot` at `now`. */
export function statesAt(snapshot: Snapshot, now: number): DataStates {
  const context: DataStateContext = {
    now,
    fetched: snapshot.fetched,
    pollInterval: snapshot.pollInterval,
    positionMode: snapshot.positionMode,
    health: snapshot.api,
  }
  return new Map(snapshot.trips.map((trip) => [trip.key, dataState(trip, context)]))
}

const same = (a: DataStates, b: DataStates) =>
  a.size === b.size && [...a].every(([key, state]) => b.get(key) === state)

/** The states of the snapshots `live` holds. */
export function dataStatesStore(live: SnapshotStore = liveSnapshot): DataStatesStore {
  let states = NONE
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopListening: (() => void) | undefined

  const get = () => {
    const now = live.get()
    const fresh = now.snapshot ? statesAt(now.snapshot, serverNow(now)) : NONE
    if (!same(fresh, states)) states = fresh
    return states
  }
  const check = () => {
    const before = states
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
        stopListening = live.subscribe(check)
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

/** The page's one store of states, from the page's live snapshot. */
export const dataStates = dataStatesStore()

/** Each drawn trip's data state now, for a component: it renders again when one changes. */
export function useDataStates(store: DataStatesStore = dataStates): DataStates {
  return useSyncExternalStore(store.subscribe, store.get, () => NONE)
}
