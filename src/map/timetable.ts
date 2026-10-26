// The browser's timetable: the network files (manifest, stops, patterns, paths, never the trips)
// loaded from the timetable routes once per version and kept in memory (docs/timetable.md, "How
// they are served and loaded"). The routes mark each version's files immutable, so a reload
// takes them from the browser's cache.
import 'client-only'
import { useEffect, useState } from 'react'
import { readNetwork, type Network } from '../timetable/network.ts'

/** Reads one route's JSON; rejects on a network failure or an answer other than a 2xx. */
export type FetchJson = (path: string) => Promise<unknown>

export interface TimetableLoader {
  /** The network of the timetable the server holds now, from its current manifest. */
  current(): Promise<Network>
  /** A version's network, such as the one a snapshot names, loaded once and then kept. */
  version(version: string): Promise<Network>
}

const fetchFromServer: FetchJson = async (path) => {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${response.status} for ${path}`)
  return response.json()
}

/** How long a failed load is answered with its failure before it is tried again. */
export const RETRY_AFTER = 30_000

/**
 * A loader that keeps every version it has loaded. A failed load is remembered for a while, so a
 * map redrawn each second doesn't ask again each time, and then tried again when asked.
 */
export function timetableLoader(fetchJson: FetchJson = fetchFromServer): TimetableLoader {
  const versions = new Map<string, Promise<Network>>()
  let current: Promise<Network> | undefined
  /** Calls `forget` a while after `load` fails. */
  const onFailure = (load: Promise<Network>, forget: () => void) =>
    load.catch(() => setTimeout(forget, RETRY_AFTER))

  const load = (version: string, manifest?: unknown): Promise<Network> => {
    let network = versions.get(version)
    if (!network) {
      const file = (name: string) =>
        fetchJson(`/api/timetable/${encodeURIComponent(version)}/${name}`)
      network = Promise.all([
        manifest ?? file('manifest'),
        file('stops'),
        file('patterns'),
        file('paths'),
      ]).then(([manifestFile, stops, patterns, paths]) =>
        readNetwork({ manifest: manifestFile, stops, patterns, paths }),
      )
      versions.set(version, network)
      onFailure(network, () => versions.delete(version))
    }
    return network
  }

  return {
    current() {
      if (!current) {
        const loading = fetchJson('/api/timetable').then((manifest) =>
          load((manifest as { version: string }).version, manifest),
        )
        current = loading
        onFailure(loading, () => {
          if (current === loading) current = undefined
        })
      }
      return current
    },
    version: (version) => load(version),
  }
}

/** The page's one loader, shared by everything on the map. */
export const timetables = timetableLoader()

/**
 * A version's network for a component, such as the one the live snapshot names: none until it
 * has loaded, then the latest loaded until the next one has. One that won't load leaves the last.
 */
export function useNetwork(
  version: string | undefined,
  loader: TimetableLoader = timetables,
): Network | undefined {
  const [network, setNetwork] = useState<Network>()
  useEffect(() => {
    if (!version) return
    let wanted = true
    loader.version(version).then(
      (loaded) => {
        if (wanted) setNetwork(loaded)
      },
      (error: unknown) => console.error('The timetable could not load', error),
    )
    return () => {
      wanted = false
    }
  }, [version, loader])
  return network
}
