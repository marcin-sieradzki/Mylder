// What the viewer has made of the map: its centre and zoom, the modes filtered out and the open
// panel, kept in the address's query so a reload, a shared link and the language switch keep
// them (docs/screens.md, "The moving map"). The query is the one place it lives: the store reads
// it back and writes it in place, without a new history entry, and leaves every other parameter
// as it was.
import 'client-only'
import { useSyncExternalStore } from 'react'
import { MODES, type Mode } from '../timetable/format.ts'

export interface MapView {
  /** Longitude and latitude, once the map has been moved or the address names them. */
  readonly centre?: readonly [number, number]
  readonly zoom?: number
  /** The modes a filter keeps off the map; none by default. */
  readonly hidden: ReadonlySet<Mode>
  /** The open panel, such as a vehicle or a stop, by the id its own screen gives it. */
  readonly panel?: string
}

export interface ViewStore {
  get(): MapView
  /** Writes what changed into the address and tells every subscriber. */
  update(change: Partial<MapView>): void
  /** Calls back on every change, the browser's back and forward too; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

// `map=11.20/55.68000/12.56500`: zoom, latitude and longitude, in the order map links use.
const MAP = 'map'
const HIDE = 'hide'
const PANEL = 'panel'

const NOTHING: MapView = { hidden: new Set() }

/** The view an address's query names; anything it can't read is left at its default. */
export function viewOf(search: string): MapView {
  const query = new URLSearchParams(search)
  const place = (query.get(MAP) ?? '').split('/').map((part) => (part ? Number(part) : NaN))
  const [zoom, lat, lon] = place
  // MapLibre refuses a latitude past a pole and won't start; a place off the map is no place.
  const placed =
    place.length === 3 &&
    within(zoom, 0, MAX_ZOOM) &&
    within(lat, -90, 90) &&
    within(lon, -180, 180)
  const hidden = new Set(
    (query.get(HIDE) ?? '').split(',').filter((mode): mode is Mode => isMode(mode)),
  )
  const panel = query.get(PANEL) ?? undefined
  return {
    ...(placed ? { centre: [lon, lat] as const, zoom } : {}),
    hidden,
    ...(panel ? { panel } : {}),
  }
}

/** The closest zoom MapLibre draws. */
const MAX_ZOOM = 24

/** Whether `value` is a number from `low` to `high`; NaN is not. */
const within = (value: number, low: number, high: number) => value >= low && value <= high

const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value)

/** `search` with the view written into it, every other parameter kept in its place. */
export function searchWith(search: string, view: MapView): string {
  const query = new URLSearchParams(search)
  const put = (name: string, value: string | undefined) =>
    value ? query.set(name, value) : query.delete(name)
  put(
    MAP,
    view.centre && view.zoom !== undefined
      ? `${view.zoom.toFixed(2)}/${view.centre[1].toFixed(5)}/${view.centre[0].toFixed(5)}`
      : undefined,
  )
  put(HIDE, MODES.filter((mode) => view.hidden.has(mode)).join(','))
  put(PANEL, view.panel)
  const written = readableQuery(query)
  return written ? `?${written}` : ''
}

/**
 * A query as an address shows it, without the `?`: commas and slashes are safe in a query, and
 * spelled out as `%2C` and `%2F` they make `map=11.20/55.68000/12.56500` unreadable.
 */
export const readableQuery = (query: URLSearchParams): string =>
  query.toString().replaceAll('%2C', ',').replaceAll('%2F', '/')

/** The view kept in this page's address. */
export function addressView(): ViewStore {
  let read: { search: string; view: MapView } | undefined
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const get = (): MapView => {
    const search = window.location.search
    if (read?.search !== search) read = { search, view: viewOf(search) }
    return read.view
  }
  return {
    get,
    update(change) {
      const { pathname, hash, search } = window.location
      const next = searchWith(search, { ...get(), ...change })
      if (next === search) return
      // Next.js's router follows replaceState, so its own reading of the query keeps up.
      window.history.replaceState(null, '', `${pathname}${next}${hash}`)
      notify()
    },
    subscribe(onChange) {
      if (listeners.size === 0) window.addEventListener('popstate', notify)
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0) window.removeEventListener('popstate', notify)
      }
    },
  }
}

/** The page's one view. */
export const mapView = addressView()

/** The map's view, for a component; the prerendered page shows the default view. */
export function useMapView(store: ViewStore = mapView): MapView {
  return useSyncExternalStore(store.subscribe, store.get, () => NOTHING)
}
