import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StopDepartures } from '../tracker/index.ts'
import { panelAnswers, type PanelDeps } from './panels.ts'
import { addressView } from './view.ts'

// The open panel's answer against the weekday recording's saved stop answers, on fake timers.
// Only what is outside Mylder is faked: the network, the timers, the server's clock and the
// jitter's random draw.
const saved = (stop: string): StopDepartures =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'recordings', 'weekday', 'answers', 'stops', `${stop}.json`),
      'utf8',
    ),
  ) as StopDepartures

const NORREPORT = saved('27532')
const HILLEROD = saved('8600683')

const S = 1000

/** What the route answers next: an answer, a 404, a 503, or no connection. */
type Answer = StopDepartures | 404 | 503 | 'offline'

let answers: Answer[]
let asked: { url: string; at: number }[]

const deps = (): PanelDeps => ({
  fetch(url) {
    asked.push({ url, at: Date.now() })
    const answer = answers.length > 1 ? answers.shift()! : answers[0]
    if (answer === 'offline') return Promise.reject(new TypeError('Failed to fetch'))
    if (typeof answer === 'number') return Promise.resolve(new Response(null, { status: answer }))
    return Promise.resolve(Response.json(answer))
  },
  timers: { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle) },
  // The server's clock is this device's: the fake timers set it.
  serverNow: () => Date.now(),
  // The jitter is 1 s plus the draw times 3 s: 1 s here.
  random: () => 0,
})

/** The page's view, with the address at `search`, and the panel answers that follow it. */
function open(search: string) {
  window.history.replaceState(null, '', `/en${search}`)
  const view = addressView()
  const store = panelAnswers(view, deps())
  const stop = store.subscribe(() => {})
  return { view, store, stop }
}

/** Lets the fetch and its body land. */
const landed = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers({ now: NORREPORT.fetched + 2 * S })
  answers = [NORREPORT]
  asked = []
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe("the open panel's answer", () => {
  it("is loading, then the stop route's answer for the stop in the address", async () => {
    const { store } = open('?stop=27532')
    expect(store.get()).toEqual({ panel: { kind: 'stop', id: '27532' }, status: 'loading' })
    await landed()
    expect(store.get()).toEqual({
      panel: { kind: 'stop', id: '27532' },
      status: 'ok',
      answer: NORREPORT,
    })
    expect(asked.map((each) => each.url)).toEqual(['/api/stops/27532'])
  })

  it('is none while no panel is open, and asks for nothing', async () => {
    const { store } = open('?hide=bus')
    await landed()
    expect(store.get()).toBeUndefined()
    expect(asked).toEqual([])
  })

  it('asks again just after the answer falls due, and takes the new answer', async () => {
    const { store } = open('?stop=27532')
    await landed()
    const later = { ...NORREPORT, fetched: NORREPORT.nextDue, nextDue: NORREPORT.nextDue + 60 * S }
    answers = [later]
    await vi.advanceTimersByTimeAsync(NORREPORT.nextDue + S - Date.now() - 1)
    expect(asked).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await landed()
    expect(asked).toHaveLength(2)
    expect(store.get()?.answer).toEqual(later)
  })

  it("says not found for a stop the route doesn't know, and stops asking", async () => {
    answers = [404]
    const { store } = open('?stop=no-such-stop')
    await landed()
    expect(store.get()).toEqual({
      panel: { kind: 'stop', id: 'no-such-stop' },
      status: 'not-found',
    })
    await vi.advanceTimersByTimeAsync(10 * 60 * S)
    expect(asked).toHaveLength(1)
  })

  it('waits out a slow answer, as the route may make the minute’s run before its own call', async () => {
    window.history.replaceState(null, '', '/en?stop=27532')
    const slow: PanelDeps = {
      ...deps(),
      fetch: (url, { signal }) =>
        new Promise((resolve, reject) => {
          asked.push({ url, at: Date.now() })
          const answering = setTimeout(() => resolve(Response.json(NORREPORT)), 45 * S)
          signal.addEventListener('abort', () => {
            clearTimeout(answering)
            reject(new DOMException('The ask was aborted', 'AbortError'))
          })
        }),
    }
    const store = panelAnswers(addressView(), slow)
    store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(45 * S)
    await landed()
    expect(store.get()).toMatchObject({ status: 'ok', answer: NORREPORT })
    expect(asked).toHaveLength(1)
  })

  it('says it failed when the first ask fails, and tries again', async () => {
    answers = [503, NORREPORT]
    const { store } = open('?stop=27532')
    await landed()
    expect(store.get()?.status).toBe('error')
    await vi.advanceTimersByTimeAsync(10 * S)
    await landed()
    expect(store.get()?.status).toBe('ok')
  })

  it('keeps the answer it has when a later ask fails', async () => {
    answers = [NORREPORT, 'offline']
    const { store } = open('?stop=27532')
    await landed()
    await vi.advanceTimersByTimeAsync(NORREPORT.nextDue + S - Date.now())
    await landed()
    expect(asked).toHaveLength(2)
    expect(store.get()).toMatchObject({ status: 'ok', answer: NORREPORT })
  })

  it('follows the address to another stop, and drops the first one’s answer', async () => {
    const { view, store } = open('?stop=27532')
    await landed()
    answers = [HILLEROD]
    view.update({ panel: { kind: 'stop', id: '8600683' } })
    expect(store.get()).toEqual({ panel: { kind: 'stop', id: '8600683' }, status: 'loading' })
    await landed()
    expect(store.get()?.answer).toEqual(HILLEROD)
    expect(asked.map((each) => each.url)).toEqual(['/api/stops/27532', '/api/stops/8600683'])
  })

  it('stops asking once the panel closes, or nothing watches it', async () => {
    const { view, store, stop } = open('?stop=27532')
    await landed()
    view.update({ panel: undefined })
    expect(store.get()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(10 * 60 * S)
    expect(asked).toHaveLength(1)
    view.update({ panel: { kind: 'stop', id: '27532' } })
    await landed()
    expect(asked).toHaveLength(2)
    stop()
    await vi.advanceTimersByTimeAsync(10 * 60 * S)
    expect(asked).toHaveLength(2)
  })

  it('asks the trip route for an open trip', async () => {
    const { store } = open('?trip=bus.5C.32331e0e20.20260616.0707')
    await landed()
    expect(store.get()?.panel).toEqual({ kind: 'trip', id: 'bus.5C.32331e0e20.20260616.0707' })
    expect(asked.map((each) => each.url)).toEqual(['/api/trips/bus.5C.32331e0e20.20260616.0707'])
  })
})
