// Each aircraft's data state now, by the clock: the domain's rule (src/domain/aircraft-state.ts)
// run again in the browser from each aircraft's position and the aircraft snapshot's own fields,
// at the aircraft server's time, so a Live plane turns Ageing on the second with no poll and
// leaves the map once its position is 5 min old (docs/aircraft.md, "The browser"). It ticks with
// that server's clock (./ticking.ts), apart from the transit snapshot's, and changes only when a
// state does, so the canvas makes the glyphs again only then.
import 'client-only'
import { useSyncExternalStore } from 'react'
import {
  aircraftState,
  type AircraftState,
  type AircraftStateContext,
} from '../domain/aircraft-state.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import { liveAircraft, type AircraftStore } from './aircraft.ts'
import { tickingStore, type TickingStore } from './ticking.ts'

/** Each aircraft on the map's data state, by its hex; one whose position is dropped is left out. */
export type AircraftStates = ReadonlyMap<string, AircraftState>

/** The aircraft's states now, ticking by the aircraft server's clock. */
export type AircraftStatesStore = TickingStore<AircraftStates>

const NONE: AircraftStates = new Map()

/** Every aircraft's state in `snapshot` at `now`, less those dropped. */
export function aircraftStatesAt(snapshot: AircraftSnapshot, now: number): AircraftStates {
  const context: AircraftStateContext = {
    now,
    fetched: snapshot.fetched,
    pollInterval: snapshot.pollInterval,
    health: snapshot.health,
  }
  const states = new Map<string, AircraftState>()
  for (const aircraft of snapshot.aircraft) {
    const state = aircraftState(aircraft, context)
    if (state) states.set(aircraft.hex, state)
  }
  return states
}

const same = (a: AircraftStates, b: AircraftStates) =>
  a.size === b.size && [...a].every(([hex, state]) => b.get(hex) === state)

/** The states of the aircraft snapshots `live` holds. */
export const aircraftStatesStore = (live: AircraftStore = liveAircraft): AircraftStatesStore =>
  tickingStore(
    ({ snapshot }, now) => (snapshot ? aircraftStatesAt(snapshot, now) : NONE),
    same,
    live,
  )

/** The page's one store of the aircraft's states, from the page's live aircraft. */
export const aircraftStates = aircraftStatesStore()

/**
 * One aircraft's data state now, for a component such as its card: it renders again only when
 * that one changes. None for an aircraft the snapshot doesn't carry, or whose position is dropped.
 */
export function useAircraftState(
  hex: string,
  store: AircraftStatesStore = aircraftStates,
): AircraftState | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().get(hex),
    () => undefined,
  )
}
