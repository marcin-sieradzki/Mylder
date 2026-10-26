'use client'

import { useSyncExternalStore } from 'react'
import { isPanelOf, usePanelState } from '../map/panels'
import { openPanel } from '../map/view'
import { StopPanel } from './StopPanel'

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

/**
 * The detail panel the address has open (docs/screens.md, "Vehicle detail" and "Stop
 * departures"), beside the map on a wide screen and from the bottom on a phone. Esc and its close
 * button take it out of the address. A stop opens its departures; a trip's detail joins here.
 */
export function DetailPanels() {
  const state = usePanelState()
  const anchor = usePhone() ? 'bottom' : 'right'
  if (isPanelOf(state, 'stop')) return <StopPanel state={state} anchor={anchor} onClose={close} />
  return null
}
