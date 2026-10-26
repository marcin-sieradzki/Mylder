import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { snapshotStore } from './live.ts'
import { snapshotPoller, type PollerDeps } from './poll.ts'

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

/** What the network answers next: a snapshot, a 503, no connection, or no answer at all. */
type Answer = Snapshot | 'unavailable' | 'offline' | 'silent'

const S = 1000

let answers: Answer[]
let polls: number[]
let visible: boolean
let onVisibility: (() => void) | undefined
/** How far the server's clock runs ahead of this device's. */
let serverAhead: number
/** How long the CDN has kept the answer, in whole seconds. */
let cacheAge: number

const fetchFake: PollerDeps['fetch'] = (url, { signal }) => {
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
      onVisibility = onChange
      return () => (onVisibility = undefined)
    },
  },
})

const setVisible = (now: boolean) => {
  visible = now
  onVisibility?.()
}

/** Polls since the start, as seconds after the first snapshot was fetched. */
const pollTimes = () => polls.map((at) => (at - first.fetched) / S)

const start = (store = snapshotStore(), draw = 0) => {
  const poller = snapshotPoller(store, deps(draw))
  poller.start()
  return { store, poller }
}

beforeEach(() => {
  // The page opens 10 s after the first snapshot was fetched, on a clock that agrees with the server's.
  vi.useFakeTimers({ now: first.fetched + 10 * S })
  answers = [first]
  polls = []
  visible = true
  serverAhead = 0
  cacheAge = 0
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
})
