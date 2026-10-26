'use client'

import type { ReactNode } from 'react'
import { MapCredit } from './MapCredit'
import styles from './MapFoot.module.css'
import { MapLegend } from './MapLegend'
import { MapTools } from './MapTools'

interface MapFootProps {
  /** Where the open sheet sits, so the foot keeps clear of it; none while it is closed. */
  sheet?: 'left' | 'bottom'
  /** The button that opens the closed sheet again, above the legend. */
  opener?: ReactNode
}

/**
 * The map's foot (docs/screens.md, "The moving map"): the legend at the bottom left, the
 * controls and the scale bar at the bottom right, and the corner credit beneath them. Beside an
 * open side sheet it starts past the sheet; over a bottom sheet it stands on its peek, so the
 * credit stays in view.
 */
export function MapFoot({ sheet, opener }: MapFootProps) {
  return (
    <div className={styles.foot} data-sheet={sheet}>
      <div className={styles.legend}>
        {opener}
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
