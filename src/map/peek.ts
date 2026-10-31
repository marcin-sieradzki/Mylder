// How far a phone's open stop sheet peeks, which it measures from its content (src/screens/
// usePeekTo.ts) and publishes here, so the map's foot stands on it and a fit keeps clear of it.
import 'client-only'
import { useSyncExternalStore } from 'react'

export interface PeekStore {
  /** The open stop sheet's peek in CSS pixels; none while no sheet measures its own. */
  get(): number | undefined
  /** Publishes the peek, or none once the sheet closes or stops measuring. */
  set(peek: number | undefined): void
  /** Calls back whenever the peek changes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A store with no peek published, so size.sheet-peek holds. */
export function peekStore(): PeekStore {
  let peek: number | undefined
  const listeners = new Set<() => void>()
  return {
    get: () => peek,
    set(to) {
      if (to === peek) return
      peek = to
      for (const listener of listeners) listener()
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one published peek. */
export const sheetPeek = peekStore()

/** The open stop sheet's peek, for a component that stands on it, such as the map's foot. */
export function useSheetPeek(store: PeekStore = sheetPeek): number | undefined {
  return useSyncExternalStore(store.subscribe, store.get, () => undefined)
}
