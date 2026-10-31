'use client'

import type { DetailPanelProps } from '@mylder/perron/patterns'
import { usePanelState, type PanelStateOf } from '../map/panels'
import { openPanel, usePanel } from '../map/view'
import { AircraftPanel } from './AircraftPanel'
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
 * The detail panel the address has open (docs/screens.md, "Vehicle detail", "Stop panel" and
 * "The plane's card"), beside the map on a wide screen and from the bottom on a phone. Esc and its
 * close button take it out of the address. A stop opens its departures, a trip its vehicle's
 * detail, an aircraft its card, which the aircraft snapshot holds rather than a route. Every kind
 * of panel the address can name renders here, so the answers asked for while this watches them
 * are always shown.
 */
export function DetailPanels() {
  const state = usePanelState()
  const panel = usePanel()
  const frame = usePhone() ? PHONE_FRAME : SIDE
  if (panel?.kind === 'aircraft') return <AircraftPanel hex={panel.id} frame={frame} />
  if (!state) return null
  switch (state.panel.kind) {
    case 'stop':
      return <StopPanel state={state as PanelStateOf<'stop'>} frame={frame} />
    case 'trip':
      return <VehiclePanel state={state as PanelStateOf<'trip'>} frame={frame} />
  }
}
