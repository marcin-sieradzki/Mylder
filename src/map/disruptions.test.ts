import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Disruptions } from '../tracker/index.ts'
import { disruptionListStore, TRIES } from './disruptions.ts'
import { RETRY_AFTER } from './timetable.ts'

/** The route's answer at a version. */
const list = (version: string): Disruptions => ({
  fetched: 1,
  checked: 1,
  ok: true,
  version,
  received: 0,
  messages: [],
  nextDue: 2,
})

/** A fetch that answers each call with the next of `answers`, then the last again, and counts. */
function answering(...answers: (Disruptions | Error)[]) {
  const paths: string[] = []
  const fetchJson = (path: string) => {
    paths.push(path)
    const next = answers.length > 1 ? answers.shift() : answers[0]
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  }
  return { fetchJson, paths }
}

/** A store with a reader, as the Disruptions tab keeps one while it shows. */
function read(fetchJson: (path: string) => Promise<unknown>) {
  const store = disruptionListStore(fetchJson)
  const seen: (string | undefined)[] = []
  store.subscribe(() => seen.push(store.get()?.version))
  return { store, seen }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the disruption list in the browser', () => {
  it('loads on the first ask, before a snapshot names a version', async () => {
    const { fetchJson, paths } = answering(list('a'))
    const { store, seen } = read(fetchJson)
    store.want(undefined)
    await vi.runAllTimersAsync()
    expect(seen).toEqual(['a'])
    expect(paths).toEqual(['/api/disruptions'])
  })

  it('loads again only when the snapshot names another version', async () => {
    const { fetchJson, paths } = answering(list('a'), list('b'))
    const { store } = read(fetchJson)
    store.want(undefined)
    await vi.runAllTimersAsync()
    store.want('a')
    store.want('a')
    expect(paths).toHaveLength(1)
    store.want('b')
    store.want('b')
    await vi.runAllTimersAsync()
    expect(paths).toHaveLength(2)
    expect(store.get()?.version).toBe('b')
  })

  it('loads the version a snapshot names while a first load is on its way', async () => {
    const { fetchJson, paths } = answering(list('a'), list('b'))
    const { store, seen } = read(fetchJson)
    store.want(undefined)
    store.want('b')
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual(['a', 'b'])
    expect(paths).toHaveLength(2)
  })

  it('keeps the list it holds through a failed load, and tries again a while later', async () => {
    const { fetchJson, paths } = answering(list('a'), new Error('503'), list('b'))
    const { store } = read(fetchJson)
    store.want('a')
    await vi.advanceTimersByTimeAsync(0)
    store.want('b')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get()?.version).toBe('a')
    await vi.advanceTimersByTimeAsync(RETRY_AFTER)
    expect(paths).toHaveLength(3)
    expect(store.get()?.version).toBe('b')
  })

  it('keeps an older version a cached route still serves, and asks again for the new one', async () => {
    const { fetchJson, paths } = answering(list('a'), list('a'), list('b'))
    const { store, seen } = read(fetchJson)
    store.want('b')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get()?.version).toBe('a')
    await vi.advanceTimersByTimeAsync(2 * RETRY_AFTER)
    expect(seen).toEqual(['a', 'a', 'b'])
    expect(paths).toHaveLength(3)
  })

  it(`gives up on a version after ${TRIES} tries, until the next is named`, async () => {
    const { fetchJson, paths } = answering(new Error('503'))
    const { store } = read(fetchJson)
    store.want('a')
    await vi.advanceTimersByTimeAsync(10 * RETRY_AFTER)
    expect(paths).toHaveLength(TRIES)
    store.want('b')
    await vi.advanceTimersByTimeAsync(0)
    expect(paths).toHaveLength(TRIES + 1)
  })

  it('stops trying again once nothing reads it', async () => {
    const { fetchJson, paths } = answering(new Error('503'))
    const store = disruptionListStore(fetchJson)
    const stop = store.subscribe(() => {})
    store.want('a')
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(10 * RETRY_AFTER)
    expect(paths).toHaveLength(1)
  })

  it('tries again after an answer that is not a disruption list', async () => {
    const answers: unknown[] = [{ error: 'unknown disruptions' }, list('a')]
    const { store, seen } = read(() => Promise.resolve(answers.shift()))
    store.want('a')
    await vi.advanceTimersByTimeAsync(RETRY_AFTER)
    expect(seen).toEqual(['a'])
  })
})
