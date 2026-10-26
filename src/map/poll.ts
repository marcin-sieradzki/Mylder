// The browser's poll of the snapshot (docs/live-data.md, "Polling"): when the page opens, then
// at each snapshot's next due plus a jitter drawn once per page load, only while the page is
// visible. A failed poll keeps the snapshot and retries after 5, 10, 20 and then every 30 s; an
// answer that isn't new yet is asked again after 5 s, three times. Everything outside Mylder
// (the network, the timers, the clock, visibility, the random draw) comes in as a dependency.
import 'client-only'
import type { Snapshot } from '../tracker/index.ts'
import type { SnapshotStore } from './live.ts'

type Timer = ReturnType<typeof setTimeout>

export interface PollerDeps {
  fetch(url: string, init: { signal: AbortSignal }): Promise<Response>
  timers: { set(run: () => void, ms: number): Timer; clear(handle: Timer): void }
  /** This device's clock, in ms since the epoch. */
  now(): number
  /** A number from 0 up to 1, for the jitter. */
  random(): number
  visibility: {
    visible(): boolean
    /** Calls back when the page is shown or hidden; returns the function that stops it. */
    watch(onChange: () => void): () => void
  }
}

export interface Poller {
  /** Polls at once if a poll is due, else when it falls due. */
  start(): void
  /** Stops polling, and drops a poll on its way. */
  stop(): void
}

const SNAPSHOT_ROUTE = '/api/snapshot'

const S = 1000

/** A poll with no answer by then has failed. */
const TIMEOUT = 10 * S

/** After the first, second, third and every later failure in a row. */
const RETRIES = [5 * S, 10 * S, 20 * S, 30 * S]

/** An answer that isn't new yet is asked again after this, at most `NOT_NEW_TRIES` times. */
const NOT_NEW_RETRY = 5 * S
const NOT_NEW_TRIES = 3

const browser = (): PollerDeps => ({
  fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
  timers: {
    set: (run, ms) => setTimeout(run, ms),
    clear: (handle) => clearTimeout(handle),
  },
  now: () => Date.now(),
  random: Math.random,
  visibility: {
    visible: () => document.visibilityState === 'visible',
    watch(onChange) {
      document.addEventListener('visibilitychange', onChange)
      return () => document.removeEventListener('visibilitychange', onChange)
    },
  },
})

const isSnapshot = (body: unknown): body is Snapshot => {
  const value = body as Partial<Snapshot> | null
  return (
    typeof value?.fetched === 'number' &&
    typeof value.nextDue === 'number' &&
    Array.isArray(value.trips)
  )
}

/** The poll that keeps `store` filled. */
export function snapshotPoller(store: SnapshotStore, deps: PollerDeps = browser()): Poller {
  const { timers, now } = deps
  /** 1 to 4 s after each next due, the same for the whole page load. */
  const jitter = S + deps.random() * 3 * S
  let running = false
  let timer: Timer | undefined
  let inFlight: AbortController | undefined
  let stopWatching: (() => void) | undefined
  /** When the next poll falls due, and when it is planned, on this device's clock. */
  let due = -Infinity
  let planned = -Infinity
  let failures = 0
  let notNew = 0

  const disarm = () => {
    if (timer !== undefined) timers.clear(timer)
    timer = undefined
  }

  // Polls now if one is due, else waits for the planned moment; never while hidden or stopped.
  const arm = () => {
    disarm()
    if (!running || inFlight || !deps.visibility.visible()) return
    if (due <= now()) void poll()
    else timer = timers.set(() => void poll(), planned - now())
  }

  const plan = (dueAt: number, plannedAt = dueAt) => {
    due = dueAt
    planned = plannedAt
    arm()
  }

  const failed = () => {
    if (store.get().failingSince === undefined) store.update({ failingSince: now() })
    plan(now() + RETRIES[Math.min(failures, RETRIES.length - 1)])
    failures += 1
  }

  const landed = (snapshot: Snapshot, headers: Headers, sent: number) => {
    const received = now()
    // The answer was made about halfway through the round trip, or, when the CDN kept it, its
    // age before that. The header counts whole seconds, so the server's clock reads up to a
    // second behind: a poll lands just after its due time, never before it.
    const made = Date.parse(headers.get('Date') ?? '')
    const age = Number(headers.get('Age') ?? 0) * S
    const clockOffset = Number.isNaN(made)
      ? store.get().clockOffset
      : made + (Number.isFinite(age) ? age : 0) - (sent + received) / 2
    const held = store.get().snapshot
    const isNew = held?.fetched !== snapshot.fetched
    store.update({
      ...(isNew ? { snapshot } : {}),
      clockOffset,
      lastGoodPoll: received,
      failingSince: undefined,
    })
    failures = 0
    const serverNow = received + clockOffset
    // While the minute's run is still going, the server answers with the snapshot before, or
    // one already past its next due: ask again shortly, a few times, then wait for the next.
    const notYet = !isNew || snapshot.nextDue <= serverNow
    notNew = notYet ? (isNew ? 1 : notNew + 1) : 0
    if (notYet && notNew <= NOT_NEW_TRIES) return plan(received + NOT_NEW_RETRY)
    const dueHere = nextDue(snapshot, serverNow) - clockOffset
    plan(dueHere, dueHere + jitter)
  }

  async function poll() {
    timer = undefined
    const controller = new AbortController()
    inFlight = controller
    const timeout = timers.set(() => controller.abort(), TIMEOUT)
    const sent = now()
    let answer: { snapshot: Snapshot; headers: Headers } | undefined
    try {
      const response = await deps.fetch(SNAPSHOT_ROUTE, { signal: controller.signal })
      if (response.ok) {
        const body: unknown = await response.json()
        if (isSnapshot(body)) answer = { snapshot: body, headers: response.headers }
      }
    } catch {
      // A network error or the timeout: the same failed poll as a 5xx.
    } finally {
      timers.clear(timeout)
    }
    // Stopped while it was on its way: whatever came back is dropped.
    if (inFlight !== controller) return
    inFlight = undefined
    if (answer) landed(answer.snapshot, answer.headers, sent)
    else failed()
  }

  return {
    start() {
      if (running) return
      running = true
      stopWatching = deps.visibility.watch(arm)
      arm()
    },
    stop() {
      running = false
      stopWatching?.()
      stopWatching = undefined
      disarm()
      inFlight?.abort()
      inFlight = undefined
    },
  }
}

/** The snapshot's next due on the server's clock, moved on by its interval once it has passed. */
function nextDue(snapshot: Snapshot, serverNow: number): number {
  if (snapshot.nextDue > serverNow) return snapshot.nextDue
  const interval = Math.max(snapshot.pollInterval, 1) * S
  return snapshot.nextDue + Math.ceil((serverNow - snapshot.nextDue) / interval) * interval
}
