// The browser's timetable: the network files (manifest, stops, patterns, paths, never the trips)
// loaded from the timetable routes once per version and kept in memory (docs/timetable.md, "How
// they are served and loaded"). The routes mark each version's files immutable, so a reload
// takes them from the browser's cache.
import 'client-only'
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

/** A loader that keeps every version it has loaded; a failed load is tried again when asked. */
export function timetableLoader(fetchJson: FetchJson = fetchFromServer): TimetableLoader {
  const versions = new Map<string, Promise<Network>>()
  let current: Promise<Network> | undefined

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
      network.catch(() => versions.delete(version))
    }
    return network
  }

  return {
    current() {
      current ??= fetchJson('/api/timetable').then((manifest) =>
        load((manifest as { version: string }).version, manifest),
      )
      current.catch(() => (current = undefined))
      return current
    },
    version: (version) => load(version),
  }
}

/** The page's one loader, shared by everything on the map. */
export const timetables = timetableLoader()
