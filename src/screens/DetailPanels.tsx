'use client'

import type { DetailPanelProps } from '@mylder/perron/patterns'
import { useSyncExternalStore } from 'react'
import { isPanelOf, usePanelState } from '../map/panels'
import { openPanel } from '../map/view'
import styles from './DetailPanels.module.css'
import { StopPanel } from './StopPanel'

/** How every detail panel sits on the screen, which each passes on to its DetailPanel. */
export interface PanelFrame {
  /** The edge it slides from: right beside the map on a wide screen, bottom on a phone. */
  readonly anchor: 'right' | 'bottom'
  /** Takes the panel out of the address, which closes it. */
  readonly onClose: () => void
  readonly slotProps?: DetailPanelProps['slotProps']
}

/** Perron's breakpoint.phone, 760px: under it the panel opens from the bottom. */
const PHONE = '(max-width: 760px)'

/** The phone query, where the browser has one; a window without (jsdom) is a desktop's. */
const phoneQuery = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia(PHONE) : undefined

const watchPhone = (onChange: () => void) => {
  const query = phoneQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** Whether the window is a phone's, by Perron's breakpoint; the prerendered page is a desktop's. */
const usePhone = () =>
  useSyncExternalStore(
    watchPhone,
    () => phoneQuery()?.matches ?? false,
    () => false,
  )

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
 * button take it out of the address. A stop opens its departures; a trip's detail joins here.
 */
export function DetailPanels() {
  const state = usePanelState()
  const frame = usePhone() ? PHONE_FRAME : SIDE
  if (isPanelOf(state, 'stop')) return <StopPanel state={state} frame={frame} />
  return null
}
