import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import type { Snapshot } from '../tracker/index.ts'
import { aircraftRoute } from './aircraft.ts'
import { liveStore, snapshotStore } from './live.ts'
import { pagePoll, snapshotPoller, snapshotRoute, type PollerDeps, type PollRoute } from './poll.ts'

// The browser's poll (docs/live-data.md, "Polling") against the weekday recording's saved
// snapshots, on fake timers. Only what is outside Mylder is faked: the network, the timers, the
// clock, the page's visibility and the jitter's random draw.
const saved = (minute: number): Snapshot =>
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        'recordings',
        'weekday',
        'snapshots',
        `${String(minute).padStart(4, '0')}.json`,
      ),
      'utf8',
    ),
  ) as Snapshot

const first = saved(1)
const second = saved(2)

/** A made-up second kind of snapshot, on a route of its own, due every 10 s. */
interface Beacons {
  readonly fetched: number
  readonly nextDue: number
  readonly pollInterval: number
  readonly beacons: readonly string[]
}

const BEACONS: PollRoute<Beacons> = {
  path: '/api/beacons',
  timeout: 4_000,
  accepts: (body): body is Beacons => Array.isArray((body as Partial<Beacons> | null)?.beacons),
}

/** What the network answers next: a snapshot, a 503, no connection, or no answer at all. */
type Answer = Snapshot | 'unavailable' | 'offline' | 'silent'

const S = 1000

let answers: Answer[]
let polls: number[]
let beaconPolls: number[]
/** The snapshot polls on their way at once, and the most there have been. */
let open: number
let mostOpen: number
let visible: boolean
/** Every poll's watch on the page's visibility. */
const onVisibility = new Set<() => void>()
/** How far the server's clock runs ahead of this device's. */
let serverAhead: number
/** How long the CDN has kept the answer, in whole seconds. */
let cacheAge: number
/** How far the beacons' server clock runs ahead of this device's: they don't share the snapshot's. */
let beaconsAhead: number
/** Whether the beacons' route is off on the server, answering 404. */
let beaconsOff: boolean

/** The beacons' server makes a snapshot on each 10 s of its own clock. */
const beaconsAnswer = () => {
  const server = Date.now() + beaconsAhead
  const fetched = first.fetched + Math.floor((server - first.fetched) / (10 * S)) * 10 * S
  const beacons: Beacons = { fetched, nextDue: fetched + 10 * S, pollInterval: 10, beacons: [] }
  return Response.json(beacons, { headers: { Date: new Date(server).toUTCString() } })
}

const fetchFake: PollerDeps['fetch'] = (url, init) => {
  if (url === BEACONS.path) {
    beaconPolls.push(Date.now())
    if (beaconsOff)
      return Promise.resolve(Response.json({ error: 'unknown beacons' }, { status: 404 }))
    return Promise.resolve(beaconsAnswer())
  }
  open += 1
  mostOpen = Math.max(open, mostOpen)
  return answerSnapshot(url, init).finally(() => (open -= 1))
}

const answerSnapshot: PollerDeps['fetch'] = (url, { signal }) => {
  expect(url).toBe('/api/snapshot')
  polls.push(Date.now())
  const answer = answers.length > 1 ? answers.shift()! : answers[0]
  if (answer === 'offline') return Promise.reject(new TypeError('Failed to fetch'))
  if (answer === 'silent')
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
    )
  if (answer === 'unavailable') return Promise.resolve(new Response(null, { status: 503 }))
  return Promise.resolve(
    Response.json(answer, {
      headers: {
        Date: new Date(Date.now() + serverAhead - cacheAge * S).toUTCString(),
        ...(cacheAge ? { Age: String(cacheAge) } : {}),
      },
    }),
  )
}

const deps = (draw = 0): PollerDeps => ({
  fetch: fetchFake,
  timers: { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle) },
  now: () => Date.now(),
  // The jitter is 1 s plus the draw times 3 s: 1 s unless a test draws otherwise, so polls land
  // on whole seconds and the date header, which counts whole seconds, reads the clock exactly.
  random: () => draw,
  visibility: {
    visible: () => visible,
    watch: (onChange) => {
      onVisibility.add(onChange)
      return () => onVisibility.delete(onChange)
    },
  },
})

const setVisible = (now: boolean) => {
  visible = now
  for (const onChange of onVisibility) onChange()
}

/** Polls since the start, as seconds after the first snapshot was fetched. */
const pollTimes = (times = polls) => times.map((at) => (at - first.fetched) / S)

const start = (store = snapshotStore(), draw = 0) => {
  const poller = snapshotPoller(store, snapshotRoute, deps(draw))
  poller.start()
  return { store, poller }
}

beforeEach(() => {
  // The page opens 10 s after the first snapshot was fetched, on a clock that agrees with the server's.
  vi.useFakeTimers({ now: first.fetched + 10 * S })
  answers = [first]
  onVisibility.clear()
  polls = []
  beaconPolls = []
  open = 0
  mostOpen = 0
  visible = true
  serverAhead = 0
  cacheAge = 0
  beaconsAhead = 0
  beaconsOff = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe("the browser's poll", () => {
  it('asks for the snapshot when the page opens and keeps it in the store', async () => {
    const { store } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(pollTimes()).toEqual([10])
    expect(store.get().snapshot?.fetched).toBe(first.fetched)
  })

  it("asks again at the snapshot's next due plus the page's jitter, each minute", async () => {
    answers = [first, second, saved(3)]
    const { store } = start()
    await vi.advanceTimersByTimeAsync(2 * 60 * S)
    // Due at 60 s and 120 s, and the jitter is drawn once for the page.
    expect(pollTimes()).toEqual([10, 61, 121])
    expect(store.get().snapshot?.fetched).toBe(saved(3).fetched)
  })

  it('waits up to 4 s past the next due, by its draw', async () => {
    answers = [first, second]
    start(snapshotStore(), 0.9)
    await vi.advanceTimersByTimeAsync(60 * S)
    expect(pollTimes()).toEqual([10, 63.7])
  })

  it("keeps the server's clock from the date header, so a device clock behind it polls on time", async () => {
    // This device runs 30 s behind the server: the page opens at the server's 0:40.
    serverAhead = 30 * S
    answers = [first, second]
    const { store } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get().clockOffset).toBe(30 * S)
    await vi.advanceTimersByTimeAsync(60 * S)
    // Due at the server's 1:00 plus 1 s, which is this device's 0:31.
    expect(pollTimes()[1]).toBe(31)
  })

  it('counts the time the CDN kept an answer, whose date header is when it was made', async () => {
    cacheAge = 20
    const { store } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get().clockOffset).toBe(0)
  })

  it('asks again after 5 s when the snapshot has not changed, up to three times', async () => {
    // The server is still running the minute's call: it answers with the snapshot before.
    answers = [first, first, first, first, first, second]
    start()
    await vi.advanceTimersByTimeAsync(3 * 60 * S)
    expect(pollTimes().slice(0, 6)).toEqual([10, 61, 66, 71, 76, 121])
  })

  it('keeps the snapshot when a poll fails, retrying after 5, 10, 20 and then every 30 s', async () => {
    answers = [first, 'unavailable', 'offline', 'unavailable', 'offline', 'offline', saved(3)]
    const { store } = start()
    await vi.advanceTimersByTimeAsync(53 * S)
    expect(store.get()).toMatchObject({ failingSince: first.fetched + 61 * S })
    expect(store.get().snapshot?.fetched).toBe(first.fetched)
    await vi.advanceTimersByTimeAsync(95 * S)
    expect(pollTimes()).toEqual([10, 61, 66, 76, 96, 126, 156])
    // The poll at 156 s lands a new snapshot, and the failure is over.
    expect(store.get().snapshot?.fetched).toBe(saved(3).fetched)
    expect(store.get().failingSince).toBeUndefined()
    expect(store.get().lastGoodPoll).toBe(first.fetched + 156 * S)
  })

  it('gives up on a poll with no answer after 10 s, and counts it as failed', async () => {
    answers = [first, 'silent', second]
    const { store } = start()
    await vi.advanceTimersByTimeAsync(60.9 * S)
    expect(store.get().failingSince).toBeUndefined()
    await vi.advanceTimersByTimeAsync(0.1 * S)
    expect(store.get().failingSince).toBe(first.fetched + 71 * S)
    await vi.advanceTimersByTimeAsync(5 * S)
    expect(pollTimes()).toEqual([10, 61, 76])
    expect(store.get().snapshot?.fetched).toBe(second.fetched)
  })

  it('stops while the page is hidden, and asks at once on return when the snapshot is past due', async () => {
    answers = [first, second]
    start()
    await vi.advanceTimersByTimeAsync(20 * S)
    setVisible(false)
    await vi.advanceTimersByTimeAsync(100 * S)
    expect(pollTimes()).toEqual([10])
    setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(pollTimes()).toEqual([10, 130])
  })

  it('waits for the next due time on return when the snapshot it holds is still fresh', async () => {
    answers = [first, second]
    start()
    await vi.advanceTimersByTimeAsync(10 * S)
    setVisible(false)
    await vi.advanceTimersByTimeAsync(10 * S)
    setVisible(true)
    await vi.advanceTimersByTimeAsync(60 * S)
    expect(pollTimes()).toEqual([10, 61])
  })

  it('does not poll at all while the page opens hidden, until it is shown', async () => {
    visible = false
    start()
    await vi.advanceTimersByTimeAsync(60 * S)
    expect(polls).toEqual([])
    setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(pollTimes()).toEqual([70])
  })

  it('stops when stopped, and a stopped poll that lands later changes nothing', async () => {
    answers = ['silent']
    const { store, poller } = start()
    await vi.advanceTimersByTimeAsync(1 * S)
    poller.stop()
    await vi.advanceTimersByTimeAsync(60 * S)
    expect(store.get().failingSince).toBeUndefined()
    expect(pollTimes()).toEqual([10])
  })

  it('can be stopped and started again, with never a second poll on its way', async () => {
    answers = ['silent', first, second]
    const { store, poller } = start()
    await vi.advanceTimersByTimeAsync(1 * S)
    poller.stop()
    await vi.advanceTimersByTimeAsync(1 * S)
    poller.start()
    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    // Nothing had landed, so it asks at once; the poll stopped on its way was dropped.
    expect(pollTimes()).toEqual([10, 12])
    expect(mostOpen).toBe(1)
    expect(store.get().snapshot?.fetched).toBe(first.fetched)
    // Stopped and started while the snapshot it holds is fresh, it waits for the next due.
    poller.stop()
    await vi.advanceTimersByTimeAsync(10 * S)
    poller.start()
    await vi.advanceTimersByTimeAsync(40 * S)
    expect(pollTimes()).toEqual([10, 12, 61])
    expect(mostOpen).toBe(1)
  })
})

describe("the page's poll of a store", () => {
  it('runs while anything on the page needs it, and starts again when something does', async () => {
    answers = [first, second]
    const use = pagePoll(() => snapshotPoller(snapshotStore(), snapshotRoute, deps()))
    const done = use()
    const alsoDone = use()
    await vi.advanceTimersByTimeAsync(0)
    done()
    done()
    await vi.advanceTimersByTimeAsync(60 * S)
    expect(pollTimes()).toEqual([10, 61])
    alsoDone()
    await vi.advanceTimersByTimeAsync(100 * S)
    expect(pollTimes()).toEqual([10, 61])
    use()
    await vi.advanceTimersByTimeAsync(0)
    expect(pollTimes()).toEqual([10, 61, 170])
  })
})

describe('two polls on two routes', () => {
  it('each polls on its own next due and keeps its own clock, and both stop while hidden', async () => {
    answers = [first, second]
    // The beacons' server runs 35 s ahead of this device, while the snapshot's agrees with it.
    beaconsAhead = 35 * S
    const snapshots = snapshotStore()
    const beacons = liveStore<Beacons>()
    snapshotPoller(snapshots, snapshotRoute, deps()).start()
    snapshotPoller(beacons, BEACONS, deps()).start()
    await vi.advanceTimersByTimeAsync(60 * S)
    expect(pollTimes()).toEqual([10, 61])
    // The page opens at the beacons' 0:45, so their next is due at 0:50, this device's 0:15.
    expect(pollTimes(beaconPolls)).toEqual([10, 16, 26, 36, 46, 56, 66])
    expect(snapshots.get().clockOffset).toBe(0)
    expect(beacons.get().clockOffset).toBe(35 * S)
    expect(beacons.get().snapshot?.fetched).toBe(first.fetched + 100 * S)
    setVisible(false)
    await vi.advanceTimersByTimeAsync(100 * S)
    expect(pollTimes()).toEqual([10, 61])
    expect(pollTimes(beaconPolls)).toHaveLength(7)
    setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(pollTimes().at(-1)).toBe(170)
    expect(pollTimes(beaconPolls).at(-1)).toBe(170)
  })
})

describe('a route that may be off', () => {
  const MAY_BE_OFF: PollRoute<Beacons> = { ...BEACONS, mayBeOff: true }

  it('stops polling at its 404 and says so in its store, holding no snapshot', async () => {
    beaconsOff = true
    const beacons = liveStore<Beacons>()
    snapshotPoller(beacons, MAY_BE_OFF, deps()).start()
    await vi.advanceTimersByTimeAsync(5 * 60 * S)
    expect(pollTimes(beaconPolls)).toEqual([10])
    expect(beacons.get()).toMatchObject({ off: true })
    expect(beacons.get().snapshot).toBeUndefined()
    expect(beacons.get().failingSince).toBeUndefined()
  })

  it('starts again after its 404, and an answer then says the route is on', async () => {
    beaconsOff = true
    const beacons = liveStore<Beacons>()
    const poller = snapshotPoller(beacons, MAY_BE_OFF, deps())
    poller.start()
    await vi.advanceTimersByTimeAsync(20 * S)
    expect(beacons.get().off).toBe(true)
    beaconsOff = false
    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(pollTimes(beaconPolls)).toEqual([10, 30])
    expect(beacons.get().off).toBeUndefined()
    expect(beacons.get().snapshot).toBeDefined()
    // It polls on from there, on the route's next due.
    await vi.advanceTimersByTimeAsync(11 * S)
    expect(pollTimes(beaconPolls)).toEqual([10, 30, 41])
  })

  it('starts again when anything on the page needs it after its 404, though something still does', async () => {
    beaconsOff = true
    const beacons = liveStore<Beacons>()
    const use = pagePoll(() => snapshotPoller(beacons, MAY_BE_OFF, deps()))
    use()
    await vi.advanceTimersByTimeAsync(20 * S)
    expect(beacons.get().off).toBe(true)
    beaconsOff = false
    use()
    await vi.advanceTimersByTimeAsync(0)
    expect(pollTimes(beaconPolls)).toEqual([10, 30])
    expect(beacons.get().off).toBeUndefined()
  })

  it('counts a 404 as a failed poll on a route that is always on', async () => {
    beaconsOff = true
    const beacons = liveStore<Beacons>()
    snapshotPoller(beacons, BEACONS, deps()).start()
    await vi.advanceTimersByTimeAsync(16 * S)
    expect(pollTimes(beaconPolls)).toEqual([10, 15, 25])
    expect(beacons.get().off).toBeUndefined()
  })
})

describe("the aircraft's route", () => {
  it("waits out the server's two feeds' timeouts, so a snapshot of both failing still lands", async () => {
    const fetched = Date.now() + 10 * S
    const failed: AircraftSnapshot = {
      fetched,
      nextDue: fetched + 10 * S,
      pollInterval: 10,
      provider: 'adsb.lol',
      health: { status: 'error', kind: 'timeout', since: fetched },
      aircraft: [],
    }
    const aircraft = liveStore<AircraftSnapshot>()
    // adsb.lol's 4 s, adsb.fi's 4 s and a wait for the call before it on the server.
    const slow: PollerDeps['fetch'] = (_url, { signal }) =>
      new Promise((resolve, reject) => {
        const answer = setTimeout(() => resolve(Response.json(failed)), 10 * S)
        signal.addEventListener('abort', () => {
          clearTimeout(answer)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    snapshotPoller(aircraft, aircraftRoute, { ...deps(), fetch: slow }).start()
    await vi.advanceTimersByTimeAsync(10 * S)
    expect(aircraft.get().snapshot).toEqual(failed)
    expect(aircraft.get().failingSince).toBeUndefined()
  })
})
