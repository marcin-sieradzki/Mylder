// Which delays the screens count (docs/screens.md, "City pulse" and "The Vehicles list"): whether
// the answers carry delays for the city, which decides the list's Delay column and, on a source
// with positions, City pulse's third figure (with none, SIRI-ET's delays being on decides it), and
// the states whose delay is known now.
import type { DataState } from '../domain/data-state'
import type { Snapshot } from '../tracker/index'

/**
 * States whose position is realtime, so whose delay is known now: a Timetable only or No signal
 * trip's is unknown.
 */
export const DELAY_KNOWN: ReadonlySet<DataState> = new Set(['live', 'ageing', 'estimated'])

/** Whether the snapshot carries delays for the city: one trip on the map with one is enough. */
export const carriesDelays = (snapshot: Snapshot): boolean =>
  snapshot.trips.some((trip) => !trip.cancelled && trip.delay !== undefined)
