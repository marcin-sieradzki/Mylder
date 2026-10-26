// Whether the About dialog is open: one store, so the top bar's About button and the corner
// credit's Rejseplanen link open the same dialog (docs/screens.md, "The About dialog").
import 'client-only'
import { useSyncExternalStore } from 'react'

export interface AboutStore {
  isOpen(): boolean
  /** Opens it from `opener`, which takes the focus back when it closes. */
  open(opener?: HTMLElement): void
  close(): void
  /** What opened it last, if anything did. */
  opener(): HTMLElement | undefined
  /** Calls back whenever it opens or closes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A store with the dialog closed. */
export function aboutStore(): AboutStore {
  let opened = false
  let opener: HTMLElement | undefined
  const listeners = new Set<() => void>()
  const set = (to: boolean) => {
    if (to === opened) return
    opened = to
    for (const listener of listeners) listener()
  }
  return {
    isOpen: () => opened,
    open(from) {
      opener = from
      set(true)
    },
    close: () => set(false),
    opener: () => opener,
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
