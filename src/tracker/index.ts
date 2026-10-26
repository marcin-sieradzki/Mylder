// The tracker's entry point. It runs on the server only: importing it from a client component
// fails the build. Four plain promise-returning functions, so no Effect type crosses this line
// and the tracker can move to an always-on service later without a rewrite (ADR 0011).
import 'server-only'
import { runTracker as run } from './runtime.ts'
import type { Disruptions } from './disruptions.ts'
import type { StopDepartures, TripDetail } from './answers.ts'
import type { Snapshot } from './snapshot.ts'

export type { Snapshot, SnapshotTrip, NextCall } from './snapshot.ts'
export type { Disruption, Disruptions } from './disruptions.ts'
export type {
  AnswerLine,
  AnswerSource,
  StopDepartures,
  StopDeparture,
  TripCall,
  TripDetail,
} from './answers.ts'

/** The whole-city snapshot: the stored one while it is fresh, else a new run's. */
export const getSnapshot = (): Promise<Snapshot> => run((tracker) => tracker.getSnapshot)

/** A stop's departures by its id, or undefined for a stop the timetable doesn't know. */
export const getStopDepartures = (stopId: string): Promise<StopDepartures | undefined> =>
  run((tracker) => tracker.getStopDepartures(stopId))

/** A trip's calls by its key, or undefined for a trip not running today. */
export const getTripDetail = (tripKey: string): Promise<TripDetail | undefined> =>
  run((tracker) => tracker.getTripDetail(tripKey))

/** The disruption list. */
export const getDisruptions = (): Promise<Disruptions> => run((tracker) => tracker.getDisruptions)
