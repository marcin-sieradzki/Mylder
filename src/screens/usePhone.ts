'use client'

import { useSyncExternalStore } from 'react'

/** Perron's breakpoint.phone, 760px; a custom property can't sit in a media query. */
const PHONE = '(max-width: 760px)'

const query = () => (typeof matchMedia === 'function' ? matchMedia(PHONE) : null)

const subscribe = (onChange: () => void) => {
  const list = query()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

/**
 * Whether the page is as narrow as a phone, for a component that lays itself out differently
 * there: it renders again when the width crosses the breakpoint. The prerendered page is a
 * desktop's.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches ?? false,
    () => false,
  )
}
