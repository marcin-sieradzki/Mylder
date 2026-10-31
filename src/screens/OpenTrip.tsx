'use client'

import { useI18n } from '../i18n/useI18n'
import { openPanel } from '../map/view'
import type { StopDeparture } from '../tracker/index'
import styles from './OpenTrip.module.css'
import { fill } from './vehicleLabel'

export interface OpenTripProps {
  /** The departure or arrival whose trip the button opens; an arrival names where it comes from. */
  departure: Pick<StopDeparture, 'trip' | 'mode' | 'line' | 'headsign'> & {
    readonly origin?: string
  }
}

/**
 * Makes a departure or arrival row open its trip's detail (docs/screens.md, "Vehicle detail"): a
 * button over the whole row, named for the trip as the row reads, "S-tog E to Køge St." for a
 * departure and "S-tog E from Holte St." for an arrival. Put it in the row's list item, which it
 * stretches over.
 */
export function OpenTrip({ departure }: OpenTripProps) {
  const { dictionary } = useI18n()
  const { mode, line, headsign, origin } = departure
  const label =
    origin === undefined
      ? fill(dictionary.vehicle.title, { mode: dictionary.modes[mode], line, headsign })
      : fill(dictionary.vehicle.titleFrom, { mode: dictionary.modes[mode], line, origin })
  return (
    <button
      type="button"
      className={styles.open}
      aria-label={label}
      onClick={() => openPanel({ kind: 'trip', id: departure.trip })}
    />
  )
}
