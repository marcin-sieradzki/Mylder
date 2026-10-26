// The browser's timetable: the network files (manifest, stops, patterns, paths, never the trips),
// and the day profiles City pulse draws, loaded from the timetable routes once per version and
// kept in memory (docs/timetable.md, "How they are served and loaded"). The routes mark each
// version's files immutable, so a reload takes them from the browser's cache.
import 'client-only'
import { useEffect, useState } from 'react'
import { readDayProfiles, type DayProfiles } from '../timetable/day-profiles.ts'
import { readNetwork, type Network } from '../timetable/network.ts'

/** Reads one route's JSON; rejects on a network failure or an answer other than a 2xx. */
export type FetchJson = (path: string) => Promise<unknown>

export interface TimetableLoader {
  /** The network of the timetable the server holds now, from its current manifest. */
  current(): Promise<Network>
  /** A version's network, such as the one a snapshot names, loaded once and then kept. */
  version(version: string): Promise<Network>
  /** A version's day profiles, loaded once and then kept, apart from its network. */
  dayProfiles(version: string): Promise<DayProfiles>
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
  const profiles = new Map<string, Promise<DayProfiles>>()
  let current: Promise<Network> | undefined
  /** Calls `forget` a while after `load` fails. */
  const onFailure = (load: Promise<unknown>, forget: () => void) =>
    load.catch(() => setTimeout(forget, RETRY_AFTER))
  /** One of a version's files from its route. */
  const fileOf = (version: string, name: string) =>
    fetchJson(`/api/timetable/${encodeURIComponent(version)}/${name}`)

  const load = (version: string, manifest?: unknown): Promise<Network> => {
    let network = versions.get(version)
    if (!network) {
      const file = (name: string) => fileOf(version, name)
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
    dayProfiles(version) {
      let loading = profiles.get(version)
      if (!loading) {
        loading = fileOf(version, 'dayProfiles').then(readDayProfiles)
        profiles.set(version, loading)
        onFailure(loading, () => profiles.delete(version))
      }
      return loading
    },
  }
}

/** The page's one loader, shared by everything on the map. */
export const timetables = timetableLoader()

/** Copenhagen's zone, every timetable's, until the one a snapshot names has loaded. */
const COPENHAGEN = 'Europe/Copenhagen'

/** The zone whose clock the timetable's times read on, for a network that may not have loaded. */
export const timezoneOf = (network: Network | undefined): string =>
  network?.manifest.timezone ?? COPENHAGEN

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

/**
 * A version's day profiles for a component: "loading" until they have loaded, then the latest
 * loaded until the next one has; "failed" when they won't load and none have, until a try after
 * `RETRY_AFTER` loads them.
 */
export function useDayProfiles(
  version: string | undefined,
  loader: TimetableLoader = timetables,
): DayProfiles | 'loading' | 'failed' {
  const [loaded, setLoaded] = useState<DayProfiles | 'failed'>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!version) return
    let wanted = true
    let retry: ReturnType<typeof setTimeout> | undefined
    loader.dayProfiles(version).then(
      (profiles) => {
        if (wanted) setLoaded(profiles)
      },
      (error: unknown) => {
        console.error('The day profiles could not load', error)
        if (!wanted) return
        setLoaded((last) => (last && last !== 'failed' ? last : 'failed'))
        // The loader forgets a failed load after RETRY_AFTER, so the next try calls again.
        retry = setTimeout(() => setAttempt((count) => count + 1), RETRY_AFTER + 1)
      },
    )
    return () => {
      wanted = false
      clearTimeout(retry)
    }
  }, [version, loader, attempt])
  return loaded ?? 'loading'
}
