'use client'

import type { AircraftState } from '../domain/aircraft-state'
import { useI18n } from '../i18n/useI18n'
import { liveAircraft } from '../map/aircraft'
import { useAircraftState } from '../map/aircraft-states'
import { useClockOffset } from '../map/live'
import { COPENHAGEN } from '../map/timetable'
import type { SnapshotAircraft } from '../tracker/aircraft/index'
import { aircraftFigures, aircraftName, aircraftStateLabel } from './aircraftLabel'
import { useServerSecond } from './useServerSecond'

export interface AircraftWords {
  /** Its callsign, or its hex. */
  readonly name: string
  /** Its type, altitude and speed, such as "A20N · 3 350 m · 593 km/h". */
  readonly figures: string
  readonly state: AircraftState
  /** Its state's label, such as "Reported 4 s ago". */
  readonly label: string
}

/**
 * What the card and the panel say of `aircraft`, from the snapshot fetched at `fetched`: its
 * state now by the aircraft server's clock, and its label read again on each of its seconds.
 */
export function useAircraftWords(aircraft: SnapshotAircraft, fetched: number): AircraftWords {
  const { dictionary } = useI18n()
  const state = useAircraftState(aircraft.hex) ?? aircraft.state
  const now = useServerSecond(useClockOffset(liveAircraft))
  return {
    name: aircraftName(aircraft),
    figures: aircraftFigures(aircraft, dictionary),
    state,
    label: aircraftStateLabel(aircraft, state, fetched, now, COPENHAGEN, dictionary),
  }
}
