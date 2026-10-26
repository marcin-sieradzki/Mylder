// A value read from the live snapshot at the server's time, such as the data states or the page
// notices (docs/live-data.md, "What ages where"). It ticks on each whole second of the server's
// clock while anything watches it, and only a tick or a landed snapshot moves it on, so a read,
// such as a render each frame, is cheap and gives what the subscribers last heard.
import 'client-only'
import { liveSnapshot, serverNow, type LiveSnapshot, type SnapshotStore } from './live.ts'

export interface TickingStore<T> {
  /** The value now; the same one until `same` says it changed. */
  get(): T
  /** Calls back whenever the value changes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** The value `read` gives of what `live` holds, at the server's time. */
export function tickingStore<T>(
  read: (live: LiveSnapshot, now: number) => T,
  same: (a: T, b: T) => boolean,
  live: SnapshotStore = liveSnapshot,
): TickingStore<T> {
  const readNow = () => {
    const now = live.get()
    return read(now, serverNow(now))
  }
  let value = readNow()
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopListening: (() => void) | undefined

  /** Takes the value now; whether it has changed. */
  const refresh = () => {
    const fresh = readNow()
    if (same(fresh, value)) return false
    value = fresh
    return true
  }
  const check = () => {
    if (refresh()) for (const listener of listeners) listener()
  }
  // On each whole second of the server's clock, where the snapshot's times fall.
  const tick = () => {
    check()
    timer = setTimeout(tick, 1000 - (serverNow(live.get()) % 1000))
  }

  return {
    get() {
      if (!stopListening) refresh()
      return value
    },
    subscribe(onChange) {
      listeners.add(onChange)
      if (!stopListening) {
        stopListening = live.subscribe(check)
        tick()
      }
      return () => {
        listeners.delete(onChange)
        if (listeners.size > 0 || !stopListening) return
        stopListening()
        stopListening = undefined
        clearTimeout(timer)
      }
    },
  }
}
