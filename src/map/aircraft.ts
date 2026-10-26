// The page's live aircraft (docs/aircraft.md, "The browser"): the aircraft snapshot's own store,
// filled by its own poll of `/api/aircraft` on its own server's clock, beside the transit
// snapshot's. A 404 says the server has the aircraft off, as under `MYLDER_AIRCRAFT_SOURCE=off`:
// the poll stops, and the page shows no aircraft and no word of them.
import 'client-only'
import { useSyncExternalStore } from 'react'
import type {
  AircraftProvider,
  AircraftSnapshot,
  SnapshotAircraft,
} from '../tracker/aircraft/index.ts'
import { liveStore, type LiveStore } from './live.ts'
import { pagePoll, snapshotPoller, type PollRoute } from './poll.ts'

/** The aircraft snapshot's store. */
export type AircraftStore = LiveStore<AircraftSnapshot>

/** The aircraft snapshot's route, which the server may have off. */
export const aircraftRoute: PollRoute<AircraftSnapshot> = {
  path: '/api/aircraft',
  // Past the server's worst, adsb.lol's 4 s timeout and then adsb.fi's, which a request waiting
  // for that call shares, so a snapshot of both failing lands before the poll gives up.
  timeout: 12_000,
  mayBeOff: true,
  accepts(body): body is AircraftSnapshot {
    const value = body as Partial<AircraftSnapshot> | null
    return (
      typeof value?.fetched === 'number' &&
      typeof value.nextDue === 'number' &&
      typeof value.provider === 'string' &&
      Array.isArray(value.aircraft)
    )
  },
}

/** The page's one aircraft store. */
export const liveAircraft: AircraftStore = liveStore<AircraftSnapshot>()

/**
 * Starts the page's poll of the aircraft if it isn't running, for as long as anything on the page
 * needs it. Returns the function that says it is no longer needed.
 */
export const pollAircraft = pagePoll(() => snapshotPoller(liveAircraft, aircraftRoute))

/** Each snapshot's aircraft by hex, found once per snapshot. */
const byHex = new WeakMap<AircraftSnapshot, ReadonlyMap<string, SnapshotAircraft>>()

/** The aircraft of `hex` in `snapshot`, for its card; none where the snapshot doesn't carry it. */
export function aircraftIn(
  snapshot: AircraftSnapshot | undefined,
  hex: string,
): SnapshotAircraft | undefined {
  if (!snapshot) return undefined
  let aircraft = byHex.get(snapshot)
  if (!aircraft) byHex.set(snapshot, (aircraft = new Map(snapshot.aircraft.map((a) => [a.hex, a]))))
  return aircraft.get(hex)
}

/** The latest aircraft snapshot, for a component: none until one lands, or while it is off. */
export function useAircraftSnapshot(
  store: AircraftStore = liveAircraft,
): AircraftSnapshot | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().snapshot,
    () => undefined,
  )
}

/** How far the aircraft server's clock is ahead of this device's, for what ages by it. */
export function useAircraftClockOffset(store: AircraftStore = liveAircraft): number {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().clockOffset,
    () => 0,
  )
}

/**
 * Where the aircraft on the page come from, for the credits and the source banner: none until an
 * aircraft snapshot has landed, so a page with the aircraft off never names them.
 */
export function useAircraftProvider(
  store: AircraftStore = liveAircraft,
): AircraftProvider | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().snapshot?.provider,
    () => undefined,
  )
}

/**
 * How many aircraft are in the box by the latest snapshot, for the Planes filter's count: none
 * until one lands. It renders again when the number changes, not with every answer.
 */
export function useAircraftCount(store: AircraftStore = liveAircraft): number | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().snapshot?.aircraft.length,
    () => undefined,
  )
}

/**
 * Since when the aircraft feed has given no data, for the legend: its last answer, or its first
 * failure when it has never answered; none while it answers, or before a snapshot lands.
 */
export function useAircraftNoDataSince(store: AircraftStore = liveAircraft): number | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => {
      const snapshot = store.get().snapshot
      if (snapshot?.health.status !== 'error') return undefined
      return snapshot.lastAnswer ?? snapshot.health.since
    },
    () => undefined,
  )
}

/** Whether the server has the aircraft off, as its 404 said, for a component. */
export function useAircraftOff(store: AircraftStore = liveAircraft): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().off === true,
    () => false,
  )
}
