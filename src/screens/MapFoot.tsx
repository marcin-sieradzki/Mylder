'use client'

import type { ReactNode } from 'react'
import { MapCredit } from './MapCredit'
import styles from './MapFoot.module.css'
import { MapLegend } from './MapLegend'
import { MapTools } from './MapTools'

interface MapFootProps {
  /** Whether the sheet is open, so the foot keeps clear of it. */
  besideSheet: boolean
  /** The button that opens the closed sheet again, above the legend. */
  opener?: ReactNode
}

/**
 * The map's foot (docs/screens.md, "The moving map"): the legend at the bottom left, the
 * controls and the scale bar at the bottom right, and the corner credit beneath them. Beside an
 * open side sheet it starts past the sheet; over a bottom sheet it stands on its peek, so the
 * credit stays in view.
 */
export function MapFoot({ besideSheet, opener }: MapFootProps) {
  return (
    <div className={styles.foot} data-sheet={besideSheet ? 'open' : undefined}>
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
