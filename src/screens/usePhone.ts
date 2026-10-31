'use client'

import { useSyncExternalStore } from 'react'
import { PHONE_QUERY } from '../map/highlight'

let list: MediaQueryList | null | undefined
/** The page's one query, made when first asked; none where there is no `matchMedia`. */
const query = () => (list ??= typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : null)

const subscribe = (onChange: () => void) => {
  query()?.addEventListener('change', onChange)
  return () => query()?.removeEventListener('change', onChange)
}

/**
 * Whether the page is as narrow as a phone, for a component that lays itself out differently
 * there: it renders again when the width crosses the breakpoint. The prerendered page is a
 * desktop's, so a layout the first paint depends on reads the width in CSS instead.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches ?? false,
    () => false,
  )
}
