'use client'

import { VehicleDotLabel } from '@mylder/perron'
import { aircraftIn, useAircraftSnapshot } from '../map/aircraft'
import { usePickedVehicle } from '../map/picking'
import type { SnapshotAircraft } from '../tracker/aircraft/index'
import { useAircraftWords } from './useAircraftWords'
import styles from './VehicleCard.module.css'
import { DotCard } from './VehicleCard'

/**
 * The plane's hover card (docs/screens.md, "The plane's card"): the picked aircraft's callsign,
 * type, altitude and speed, and its data state and its label, against its dot, aged by the clock.
 */
export function AircraftCard() {
  const picked = usePickedVehicle()
  const snapshot = useAircraftSnapshot()
  const aircraft = picked?.kind === 'aircraft' ? aircraftIn(snapshot, picked.key) : undefined
  if (!picked || !snapshot || !aircraft) return null
  return <Card aircraft={aircraft} fetched={snapshot.fetched} point={picked.point} />
}

interface CardProps {
  aircraft: SnapshotAircraft
  /** When its snapshot was fetched, which its position's age counts from. */
  fetched: number
  point: readonly [number, number]
}

function Card({ aircraft, fetched, point }: CardProps) {
  const { name, figures, state, label } = useAircraftWords(aircraft, fetched)
  return (
    <DotCard point={point}>
      <span className={styles.title}>{name}</span>
      {figures ? <span>{figures}</span> : null}
      <span className={styles.state}>
        <VehicleDotLabel variant={state} />
        <span>{label}</span>
      </span>
    </DotCard>
  )
}
