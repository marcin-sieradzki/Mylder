'use client'

import type { DetailPanelProps } from '@mylder/perron/patterns'
import { usePanelState, type PanelStateOf } from '../map/panels'
import { openPanel } from '../map/view'
import styles from './DetailPanels.module.css'
import { StopPanel } from './StopPanel'
import { usePhone } from './usePhone'
import { VehiclePanel } from './VehiclePanel'

/** How every detail panel sits on the screen, which each passes on to its DetailPanel. */
export interface PanelFrame {
  /** The edge it slides from: right beside the map on a wide screen, bottom on a phone. */
  readonly anchor: 'right' | 'bottom'
  /** Takes the panel out of the address, which closes it. */
  readonly onClose: () => void
  readonly slotProps?: DetailPanelProps['slotProps']
}

const close = () => openPanel(undefined)

const SIDE: PanelFrame = {
  anchor: 'right',
  onClose: close,
  slotProps: { viewport: { className: styles.side } },
}
const PHONE_FRAME: PanelFrame = { anchor: 'bottom', onClose: close }

/**
 * The detail panel the address has open (docs/screens.md, "Vehicle detail" and "Stop
 * departures"), beside the map on a wide screen and from the bottom on a phone. Esc and its close
 * button take it out of the address. A stop opens its departures, a trip its vehicle's detail.
 * Every kind of panel the address can name renders here, so the answers asked for while this
 * watches them are always shown.
 */
export function DetailPanels() {
  const state = usePanelState()
  const frame = usePhone() ? PHONE_FRAME : SIDE
  if (!state) return null
  switch (state.panel.kind) {
    case 'stop':
      return <StopPanel state={state as PanelStateOf<'stop'>} frame={frame} />
    case 'trip':
      return <VehiclePanel state={state as PanelStateOf<'trip'>} frame={frame} />
  }
}
