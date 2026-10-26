'use client'

import { EmptyState, Text, VehicleDotLabel } from '@mylder/perron'
import { DetailPanel } from '@mylder/perron/patterns'
import { useEffect } from 'react'
import { useI18n } from '../i18n/useI18n'
import { aircraftIn, liveAircraft, pollAircraft, useAircraftOff } from '../map/aircraft'
import { useAircraftState } from '../map/aircraft-states'
import { useSnapshot } from '../map/live'
import type { SnapshotAircraft } from '../tracker/aircraft/index'
import styles from './AircraftPanel.module.css'
import type { PanelFrame } from './DetailPanels'
import { useAircraftWords } from './useAircraftWords'

export interface AircraftPanelProps {
  /** The open aircraft's hex, as the address keeps it. */
  hex: string
  /** Where the panel sits and how it closes, as every detail panel's. */
  frame: PanelFrame
}

/**
 * A plane's panel (docs/screens.md, "The plane's card"): what its hover card says, opened by a tap
 * and closed as every detail panel is. It reads the aircraft snapshot, and keeps the aircraft's
 * poll running while it is open, even with the Planes filter hiding them, since the plane is what
 * the person asked to see; it says so once the plane has left the snapshot.
 */
export function AircraftPanel({ hex, frame }: AircraftPanelProps) {
  useEffect(() => pollAircraft(), [])
  const { dictionary } = useI18n()
  const words = dictionary.aircraft
  const snapshot = useSnapshot(liveAircraft)
  const off = useAircraftOff()
  // Gone from the map once its position is old enough to drop, though no poll has said so yet.
  const dropped = useAircraftState(hex) === undefined
  const aircraft = dropped ? undefined : aircraftIn(snapshot, hex)
  if (snapshot && aircraft)
    return <Shown aircraft={aircraft} fetched={snapshot.fetched} frame={frame} />
  const gone = snapshot !== undefined || off
  return (
    <DetailPanel {...frame} open variant="line" title={gone ? words.gone : hex}>
      {gone ? (
        <EmptyState title={words.gone}>{words.goneDetail}</EmptyState>
      ) : (
        <Text variant="body-sm" emphasis="secondary" render={<output />}>
          {words.loading}
        </Text>
      )}
    </DetailPanel>
  )
}

interface ShownProps {
  aircraft: SnapshotAircraft
  fetched: number
  frame: PanelFrame
}

/** The plane's name, figures, state and label, aged by the clock. */
function Shown({ aircraft, fetched, frame }: ShownProps) {
  const { name, figures, state, label } = useAircraftWords(aircraft, fetched)
  return (
    <DetailPanel {...frame} open variant="line" title={name}>
      {figures ? <Text variant="body-sm">{figures}</Text> : null}
      <div className={styles.state}>
        <VehicleDotLabel variant={state} />
        <Text variant="body-sm">{label}</Text>
      </div>
    </DetailPanel>
  )
}
