'use client'

import { MapTooltip, VehicleDotLabel } from '@mylder/perron'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useLiveSnapshot, type LiveSnapshot } from '../map/live'
import { pickedVehicle, usePickedVehicle } from '../map/picking'
import { serverNow, useDataStates } from '../map/states'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import styles from './VehicleCard.module.css'
import { stateLabelOf, titleOf } from './vehicleLabel'

/** Each snapshot's trips by key, found once per snapshot. */
const tripsBy = new WeakMap<Snapshot, ReadonlyMap<string, SnapshotTrip>>()

function tripOf(snapshot: Snapshot | undefined, key: string | undefined) {
  if (!snapshot || key === undefined) return undefined
  let trips = tripsBy.get(snapshot)
  if (!trips) tripsBy.set(snapshot, (trips = new Map(snapshot.trips.map((t) => [t.key, t]))))
  return trips.get(key)
}

/** The server's time, read again on each of its whole seconds while the card is open. */
function useServerSecond(live: LiveSnapshot): number {
  const [now, setNow] = useState(() => serverNow(live))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const at = serverNow(live)
      setNow(at)
      timer = setTimeout(tick, 1000 - (at % 1000))
    }
    tick()
    return () => clearTimeout(timer)
  }, [live])
  return now
}

const close = () => pickedVehicle.clear()

/**
 * The hover card (docs/screens.md, "The moving map"): the picked dot's line, destination, data
 * state and its label, against the dot, aged by the clock.
 */
export function VehicleCard() {
  const picked = usePickedVehicle()
  const live = useLiveSnapshot()
  const trip = tripOf(live.snapshot, picked?.key)
  if (!picked || !trip) return null
  return <Card trip={trip} point={picked.point} live={live} />
}

interface CardProps {
  trip: SnapshotTrip
  point: readonly [number, number]
  live: LiveSnapshot
}

function Card({ trip, point, live }: CardProps) {
  const { dictionary } = useI18n()
  const words = dictionary.vehicle
  const state = useDataStates().get(trip.key) ?? trip.state
  const now = useServerSecond(live)
  const [x, y] = point
  // A point on the page, which the card sits against; a new one when the dot moves.
  const anchor = useMemo(
    () => ({ getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) }),
    [x, y],
  )
  const label = stateLabelOf(trip, state, now, words)
  return (
    <MapTooltip open anchorEl={anchor} onClose={close} role="tooltip" className={styles.card}>
      <span className={styles.title}>{titleOf(trip, words)}</span>
      <span className={styles.state}>
        <VehicleDotLabel variant={state} />
        {label === undefined ? null : <span>{label}</span>}
      </span>
    </MapTooltip>
  )
}
