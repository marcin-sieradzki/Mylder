// Whether the About dialog is open: one store, so the top bar's About button and the corner
// credit's Rejseplanen link open the same dialog (docs/screens.md, "The About dialog").
import 'client-only'
import { useSyncExternalStore } from 'react'

export interface AboutStore {
  isOpen(): boolean
  open(): void
  close(): void
  /** Calls back whenever it opens or closes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A store with the dialog closed. */
export function aboutStore(): AboutStore {
  let opened = false
  const listeners = new Set<() => void>()
  const set = (to: boolean) => {
    if (to === opened) return
    opened = to
    for (const listener of listeners) listener()
  }
  return {
    isOpen: () => opened,
    open: () => set(true),
    close: () => set(false),
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one About dialog. */
export const aboutDialog = aboutStore()

/** Whether the About dialog is open, for the dialog itself. */
export function useAboutOpen(store: AboutStore = aboutDialog): boolean {
  return useSyncExternalStore(store.subscribe, store.isOpen, () => false)
}
