// Whether the map's motion is paused: the pause control's state, which the vehicles' loop
// follows (docs/screens.md, "The moving map"). Paused, the dots stand still and step to their
// new places once per snapshot, as under the system's reduced motion setting.
import 'client-only'
import { useSyncExternalStore } from 'react'

export interface MotionPause {
  get(): boolean
  set(paused: boolean): void
  toggle(): void
  /** Calls back whenever it is paused or resumed; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A pause, not paused yet. */
export function motionPauseStore(): MotionPause {
  let paused = false
  const listeners = new Set<() => void>()
  const set = (to: boolean) => {
    if (to === paused) return
    paused = to
    for (const listener of listeners) listener()
  }
  return {
    get: () => paused,
    set,
    toggle: () => set(!paused),
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one pause, which the pause control sets. */
export const motionPause = motionPauseStore()

/** Whether the motion is paused, for a component such as the pause control. */
export function useMotionPaused(pause: MotionPause = motionPause): boolean {
  return useSyncExternalStore(pause.subscribe, pause.get, () => false)
}
