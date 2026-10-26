'use client'

import { useI18n } from '../i18n/useI18n'
import { openPanel } from '../map/view'
import type { StopDeparture } from '../tracker/index'
import styles from './OpenTrip.module.css'
import { fill } from './vehicleLabel'

export interface OpenTripProps {
  /** The departure whose trip the button opens. */
  departure: Pick<StopDeparture, 'trip' | 'mode' | 'line' | 'headsign'>
}

/**
 * Makes a departure row open its trip's detail (docs/screens.md, "Vehicle detail"): a button over
 * the whole row, named for the trip as its card is, "S-tog E to Køge St.". Put it in the row's
 * list item, which it stretches over.
 */
export function OpenTrip({ departure }: OpenTripProps) {
  const { dictionary } = useI18n()
  const label = fill(dictionary.vehicle.title, {
    mode: dictionary.modes[departure.mode],
    line: departure.line,
    headsign: departure.headsign,
  })
  return (
    <button
      type="button"
      className={styles.open}
      aria-label={label}
      onClick={() => openPanel({ kind: 'trip', id: departure.trip })}
    />
  )
}
