import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Disruptions } from '../tracker/index.ts'
import { disruptionListStore } from './disruptions.ts'
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

/** A fetch that answers each call with the next of `answers`, and counts its calls. */
function answering(...answers: (Disruptions | Error)[]) {
  const paths: string[] = []
  const fetchJson = (path: string) => {
    paths.push(path)
    const next = answers.shift()
    return next instanceof Error || next === undefined
      ? Promise.reject(next ?? new Error('no answer'))
      : Promise.resolve(next)
  }
  return { fetchJson, paths }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the disruption list in the browser', () => {
  it('loads on the page’s first ask, before a snapshot names a version', async () => {
    const { fetchJson, paths } = answering(list('a'))
    const store = disruptionListStore(fetchJson)
    store.want(undefined)
    await vi.runAllTimersAsync()
    expect(store.get()?.version).toBe('a')
    expect(paths).toEqual(['/api/disruptions'])
  })

  it('loads again only when the snapshot names another version', async () => {
    const { fetchJson, paths } = answering(list('a'), list('b'))
    const store = disruptionListStore(fetchJson)
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

  it('tells its subscribers when a list lands', async () => {
    const store = disruptionListStore(answering(list('a')).fetchJson)
    const onChange = vi.fn<() => void>()
    store.subscribe(onChange)
    store.want('a')
    await vi.runAllTimersAsync()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps the list it holds through a failed load, and tries again a while later', async () => {
    const { fetchJson, paths } = answering(list('a'), new Error('503'), list('b'))
    const store = disruptionListStore(fetchJson)
    store.want('a')
    await vi.runAllTimersAsync()
    store.want('b')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get()?.version).toBe('a')
    expect(paths).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(RETRY_AFTER)
    expect(paths).toHaveLength(3)
    expect(store.get()?.version).toBe('b')
  })

  it('drops an answer that a later version’s load has overtaken', async () => {
    let resolveFirst: (value: Disruptions) => void = () => {}
    const answers = [
      new Promise<Disruptions>((resolve) => (resolveFirst = resolve)),
      Promise.resolve(list('b')),
    ]
    const store = disruptionListStore(() => answers.shift()!)
    store.want('a')
    store.want('b')
    await vi.advanceTimersByTimeAsync(0)
    resolveFirst(list('a'))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get()?.version).toBe('b')
  })

  it('ignores an answer that is not a disruption list', async () => {
    const store = disruptionListStore(() => Promise.resolve({ error: 'unknown disruptions' }))
    store.want('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get()).toBeUndefined()
  })
})
