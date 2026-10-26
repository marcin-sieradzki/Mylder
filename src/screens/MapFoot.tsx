'use client'

import { MapCredit } from './MapCredit'
import styles from './MapFoot.module.css'
import { MapLegend } from './MapLegend'
import { MapTools } from './MapTools'

/**
 * The map's foot (docs/screens.md, "The moving map"): the legend at the bottom left, the
 * controls and the scale bar at the bottom right, and the corner credit beneath them.
 */
export function MapFoot() {
  return (
    <div className={styles.foot}>
      <div className={styles.legend}>
        <MapLegend />
      </div>
      <div className={styles.tools}>
        <MapTools />
      </div>
      <div className={styles.credit}>
        <MapCredit />
      </div>
    </div>
  )
}
