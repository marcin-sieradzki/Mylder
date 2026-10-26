// What the viewer has made of the map: its centre and zoom, the modes filtered out and the open
// panel (`?stop=<id>` or `?trip=<key>`, one at a time), kept in the address's query so a reload, a
// shared link and the language switch keep them (docs/screens.md, "The moving map"). The query is the one place it lives: the store reads
// it back and writes it in place, without a new history entry, and leaves every other parameter
// as it was.
import 'client-only'
import { useSyncExternalStore } from 'react'
import { MODES, type Mode } from '../timetable/format.ts'

/** What a panel shows: a stop by its id, or a trip, a vehicle's detail, by its key. */
export type PanelKind = 'stop' | 'trip'

/** An open panel, kept in the address as `?stop=<id>` or `?trip=<key>`. */
export interface Panel {
  readonly kind: PanelKind
  readonly id: string
}

export interface MapView {
  /** Longitude and latitude, once the map has been moved or the address names them. */
  readonly centre?: readonly [number, number]
  readonly zoom?: number
  /** The modes a filter keeps off the map; none by default. */
  readonly hidden: ReadonlySet<Mode>
  /** The open panel, a stop's departures or a vehicle's detail; one at a time. */
  readonly panel?: Panel
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
/** Each panel's parameter, by what it shows. */
const PANELS: Readonly<Record<PanelKind, string>> = { stop: 'stop', trip: 'trip' }
const KINDS = Object.keys(PANELS) as PanelKind[]

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
  const panel = panelOf(query)
  return {
    ...(placed ? { centre: [lon, lat] as const, zoom } : {}),
    hidden,
    ...(panel ? { panel } : {}),
  }
}

/** The panel a query opens: the first of `stop` and `trip` it names, when it names one. */
function panelOf(query: URLSearchParams): Panel | undefined {
  for (const [name, value] of query) {
    const kind = KINDS.find((each) => PANELS[each] === name)
    if (kind && value) return { kind, id: value }
  }
  return undefined
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
  for (const kind of KINDS) put(PANELS[kind], view.panel?.kind === kind ? view.panel.id : undefined)
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
  // The filters stay the same set, and the panel the same object, while the map moves, so what
  // follows them sees they didn't change.
  const get = (): MapView => {
    const search = window.location.search
    if (read?.search === search) return read.view
    const view = viewOf(search)
    const was = read?.view
    const sameHidden =
      was?.hidden.size === view.hidden.size && [...view.hidden].every((m) => was.hidden.has(m))
    const samePanel = was?.panel?.kind === view.panel?.kind && was?.panel?.id === view.panel?.id
    read = {
      search,
      view: {
        ...view,
        hidden: sameHidden ? was.hidden : view.hidden,
        ...(samePanel && was?.panel ? { panel: was.panel } : {}),
      },
    }
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

/**
 * The modes the filters hide, for a component: it renders again when a filter changes, not when
 * the map moves. The prerendered page hides none.
 */
export function useHiddenModes(store: ViewStore = mapView): ReadonlySet<Mode> {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().hidden,
    () => NOTHING.hidden,
  )
}

/**
 * The open panel, for a component such as the one that chooses it: it renders again when a panel
 * opens, closes or changes, not when the map moves. The prerendered page has none open.
 */
export function usePanel(store: ViewStore = mapView): Panel | undefined {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().panel,
    () => undefined,
  )
}

/** Opens a panel in the address, closing whichever was open; none closes it. */
export const openPanel = (panel: Panel | undefined, store: ViewStore = mapView): void =>
  store.update({ panel })
