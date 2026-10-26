// The page's disruption list: the route's answer, loaded on the page's first ask and again
// whenever the snapshot names another version of it (docs/live-data.md, "The snapshot"), in one
// store that React reads through `useSyncExternalStore`.
import 'client-only'
import { useEffect, useSyncExternalStore } from 'react'
import type { Disruptions } from '../tracker/index.ts'
import { useSnapshot } from './live.ts'
import { fetchFromServer, RETRY_AFTER, type FetchJson } from './timetable.ts'

export const DISRUPTIONS_ROUTE = '/api/disruptions'

export interface DisruptionListStore {
  /** The latest list that landed; none until the first has. */
  get(): Disruptions | undefined
  /**
   * Loads the list unless the one held, or the one on its way, is this version. With no version,
   * before a snapshot names one, it loads only when nothing is held or on its way.
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
 * A store holding no list yet. Only the latest load's answer lands; a failed one leaves the list
 * held and is tried again a while later, unless a newer version has been asked for meanwhile.
 */
export function disruptionListStore(fetchJson: FetchJson = fetchFromServer): DisruptionListStore {
  let list: Disruptions | undefined
  /** The version of the load on its way, `null` for one asked with no version. */
  let loading: string | null | undefined
  let latest = 0
  const listeners = new Set<() => void>()

  const load = (version: string | undefined) => {
    const call = ++latest
    loading = version ?? null
    const settle = () => {
      if (call !== latest) return false
      loading = undefined
      return true
    }
    fetchJson(DISRUPTIONS_ROUTE).then(
      (body) => {
        if (!settle() || !isDisruptions(body)) return
        list = body
        for (const listener of listeners) listener()
      },
      () => {
        if (!settle()) return
        setTimeout(() => {
          if (call === latest) load(version)
        }, RETRY_AFTER)
      },
    )
  }

  return {
    get: () => list,
    want(version) {
      if (version === undefined) {
        if (list === undefined && loading === undefined) load(version)
        return
      }
      if (list?.version !== version && loading !== version) load(version)
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
 * The disruption list for a component, loaded when it first asks and again when the live
 * snapshot names another version: none until the first has landed.
 */
export function useDisruptionList(store: DisruptionListStore = disruptionList) {
  const version = useSnapshot()?.disruptions?.version
  useEffect(() => store.want(version), [store, version])
  return useSyncExternalStore(store.subscribe, store.get, () => undefined)
}
