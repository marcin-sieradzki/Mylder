// The page's disruption list: the route's answer, loaded once the page asks and again whenever
// the snapshot names another version of it (docs/live-data.md, "The snapshot"), in one store
// that React reads through `useSyncExternalStore`.
import 'client-only'
import { useEffect, useSyncExternalStore } from 'react'
import { readList, type ListReading } from '../domain/disruption.ts'
import type { Disruption, Disruptions } from '../tracker/index.ts'
import { usePollMoment, useSnapshot } from './live.ts'
import { fetchFromServer, RETRY_AFTER, type FetchJson } from './timetable.ts'

export const DISRUPTIONS_ROUTE = '/api/disruptions'

/** How many times one version is asked for before the store waits for the next. */
export const TRIES = 3

export interface DisruptionListStore {
  /** The latest list that landed; none until the first has. */
  get(): Disruptions | undefined
  /**
   * Loads the list unless the one held is this version or a load is on its way. With no version,
   * before a snapshot names one, any list will do.
   */
  want(version: string | undefined): void
  /** Calls back when a list lands; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

const isDisruptions = (body: unknown): body is Disruptions => {
  const value = body as Partial<Disruptions> | null
  return (
    typeof value?.version === 'string' &&
    typeof value.ok === 'boolean' &&
    Array.isArray(value.messages)
  )
}

/**
 * A store holding no list yet. A load that fails, or lands another version than the one wanted,
 * as a CDN still serving the last one does, is tried again a while later, up to `TRIES` times,
 * while anything still reads the store. Whatever lands is kept: an older list beats none.
 */
export function disruptionListStore(fetchJson: FetchJson = fetchFromServer): DisruptionListStore {
  let list: Disruptions | undefined
  /** The version the latest `want` named. */
  let wanted: string | undefined
  let loading = false
  let tries = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()

  const done = () => list !== undefined && (wanted === undefined || list.version === wanted)

  const load = () => {
    const asked = wanted
    loading = true
    tries++
    fetchJson(DISRUPTIONS_ROUTE)
      .then((body) => {
        if (!isDisruptions(body)) return
        list = body
        for (const listener of listeners) listener()
      })
      .catch(() => {})
      .finally(() => {
        loading = false
        if (done()) return
        // A newer version was wanted while this one was on its way.
        if (wanted !== asked) return load()
        if (tries >= TRIES) return
        retry = setTimeout(() => {
          retry = undefined
          if (listeners.size > 0 && !done()) load()
        }, RETRY_AFTER)
      })
  }

  return {
    get: () => list,
    want(version) {
      if (version !== undefined && version !== wanted) {
        wanted = version
        tries = 0
        clearTimeout(retry)
        retry = undefined
      }
      if (done() || loading || retry !== undefined) return
      load()
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one list. */
export const disruptionList = disruptionListStore()

/**
 * The disruption list for a component, loaded when one first asks and again when the live
 * snapshot names another version: none until the first has landed.
 */
export function useDisruptionList(store: DisruptionListStore = disruptionList) {
  const version = useSnapshot()?.disruptions?.version
  const list = useSyncExternalStore(store.subscribe, store.get, () => undefined)
  useEffect(() => store.want(version), [store, version])
  return list
}

/** The list with how the screen reads it now. */
export interface ListedDisruptions {
  readonly list: Disruptions
  readonly reading: ListReading<Disruption>
  /** The server's clock it was read at. */
  readonly now: number
}

/**
 * The disruption list read at the server's clock when the latest poll landed, so it moves on
 * with each poll; before the first poll, at the list's own last check. None until it has landed.
 */
export function useListedDisruptions(
  store: DisruptionListStore = disruptionList,
): ListedDisruptions | undefined {
  const list = useDisruptionList(store)
  const polled = usePollMoment()
  if (!list) return undefined
  const now = polled ?? list.checked ?? list.fetched ?? 0
  return { list, reading: readList(list, now), now }
}
