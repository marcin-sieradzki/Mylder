// The aircraft source's types for the browser, which imports them only (ADR 0011).
import 'server-only'

export type {
  AircraftHealth,
  AircraftProvider,
  AircraftSnapshot,
  SnapshotAircraft,
} from './snapshot.ts'
