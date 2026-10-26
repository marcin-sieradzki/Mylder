'use client'

import type { ReactNode, Ref } from 'react'
import { MapCredit } from './MapCredit'
import styles from './MapFoot.module.css'
import { MapLegend } from './MapLegend'
import { MapTools } from './MapTools'

interface MapFootProps {
  /** Whether the sheet is open, so the foot keeps clear of it. */
  besideSheet: boolean
  /** Whether a detail panel is open, so the controls and the credit keep clear of it. */
  besidePanel: boolean
  /** The button that opens the closed sheet again, above the legend. */
  opener?: ReactNode
  /**
   * The legend, with the opener over it: the part of the foot in the room beside the sheet, which
   * a fit to a highlight keeps clear of. The controls stand where the detail panel does.
   */
  legendRef?: Ref<HTMLDivElement>
}

/**
 * The map's foot (docs/screens.md, "The moving map"): the legend at the bottom left, the
 * controls and the scale bar at the bottom right, and the corner credit beneath them. Beside an
 * open side sheet it starts past the sheet, and beside an open detail panel it ends before the
 * panel; over a bottom sheet it stands on its peek, so the credit stays in view. A bottom panel
 * on a phone covers it, and the panel's own source line names the source there.
 */
export function MapFoot({ besideSheet, besidePanel, opener, legendRef }: MapFootProps) {
  return (
    <div
      className={styles.foot}
      data-sheet={besideSheet ? 'open' : undefined}
      data-panel={besidePanel ? 'open' : undefined}
    >
      <div ref={legendRef} className={styles.legend}>
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
