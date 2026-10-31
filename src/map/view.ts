// What the viewer has made of the map: its centre and zoom, its heading and tilt while it isn't
// flat and north-up (docs/screens.md, "The 3D view"), what its filters keep off it, the open panel
// (`?stop=<id>`, `?trip=<key>` or `?aircraft=<hex>`, one at a time), an open stop's list
// (`&board=arrivals`) and the sheet's open tab, kept
// in the address's query so a reload, a shared link and the language switch keep them
// (docs/screens.md, "The moving map"). The query is the one place it lives: the store reads it
// back and writes it in place, without a new history entry, and leaves every other parameter as
// it was.
import 'client-only'
import { useSyncExternalStore } from 'react'
import { MODES, type Mode } from '../timetable/format.ts'

/**
 * What a panel shows: a stop by its id, a trip, a vehicle's detail, by its key, or an aircraft's
 * card by its hex.
 */
export type PanelKind = 'stop' | 'trip' | 'aircraft'

/** An open panel, kept in the address as `?stop=<id>`, `?trip=<key>` or `?aircraft=<hex>`. */
export interface Panel {
  readonly kind: PanelKind
  readonly id: string
}

export interface MapView {
  /** Longitude and latitude, once the map has been moved or the address names them. */
  readonly centre?: readonly [number, number]
  readonly zoom?: number
  /**
   * The compass heading up the map, clockwise from north in degrees, -180 to 180, while it is
   * turned; north-up when none.
   */
  readonly bearing?: number
  /** The tilt from looking straight down, in degrees, up to `MAX_PITCH`, while tilted; flat when none. */
  readonly pitch?: number
  /** The modes a filter keeps off the map; none by default. */
  readonly hidden: ReadonlySet<Mode>
  /** Whether the Planes filter keeps the aircraft off the map; it shows them by default. */
  readonly aircraftHidden?: boolean
  /** The open panel, a stop's departures, a vehicle's detail or an aircraft's card; one at a time. */
  readonly panel?: Panel
  /** An open stop's list, when it isn't the first, Departures. */
  readonly board?: StopBoard
  /** The sheet's open tab, when it isn't the first, City pulse. */
  readonly tab?: SheetTab
}

/**
 * What a filter can keep off the map: a mode's vehicles, or the aircraft. The address's `hide=`
 * names them in this order, `?hide=bus,aircraft`; the modes alone are what the screens that count
 * vehicles filter by.
 */
export type MapFilter = Mode | 'aircraft'
const MAP_FILTERS: readonly MapFilter[] = [...MODES, 'aircraft']

/** Whether the view's filters keep `filter` off the map. */
const hides = (view: MapView, filter: MapFilter): boolean =>
  filter === 'aircraft' ? view.aircraftHidden === true : view.hidden.has(filter)

/** The sheet's tabs, in their order; the first is open unless the address names another. */
export const SHEET_TABS = ['pulse', 'vehicles', 'disruptions'] as const
export type SheetTab = (typeof SHEET_TABS)[number]

/**
 * A stop panel's two lists, in their tabs' order (docs/screens.md, "Stop panel"); the first is open
 * unless the address names the other.
 */
export const STOP_BOARDS = ['departures', 'arrivals'] as const
export type StopBoard = (typeof STOP_BOARDS)[number]

/** Whether `value` names one of a stop panel's lists. */
export const isStopBoard = (value: string | null): value is StopBoard =>
  (STOP_BOARDS as readonly (string | null)[]).includes(value)

export interface ViewStore {
  get(): MapView
  /** Writes what changed into the address and tells every subscriber. */
  update(change: Partial<MapView>): void
  /** Calls back on every change, the browser's back and forward too; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

// `map=11.20/55.68000/12.56500`: zoom, latitude and longitude, in the order map links use, then
// `/-35.0/50.0`, the heading and the tilt, while the map is turned or tilted (the 3D view).
const MAP = 'map'
const HIDE = 'hide'
const TAB = 'tab'
const BOARD = 'board'
/** Each panel's parameter, by what it shows. */
const PANELS: Readonly<Record<PanelKind, string>> = {
  stop: 'stop',
  trip: 'trip',
  aircraft: 'aircraft',
}
const KINDS = Object.keys(PANELS) as PanelKind[]

const NOTHING: MapView = { hidden: new Set() }

/** The view an address's query names; anything it can't read is left at its default. */
export function viewOf(search: string): MapView {
  const query = new URLSearchParams(search)
  const place = (query.get(MAP) ?? '').split('/').map((part) => (part ? Number(part) : NaN))
  const [zoom, lat, lon, bearing, pitch] = place
  // MapLibre refuses a latitude past a pole and won't start; a place off the map is no place. A
  // heading or a tilt out of range is dropped, and the place still opens, north-up or flat.
  const placed =
    (place.length === 3 || place.length === 5) &&
    within(zoom, 0, MAX_ZOOM) &&
    within(lat, -90, 90) &&
    within(lon, -180, 180)
  const angled = placed && place.length === 5
  const hide = (query.get(HIDE) ?? '').split(',')
  const hidden = new Set(hide.filter((mode): mode is Mode => isMode(mode)))
  const panel = panelOf(query)
  const tab = query.get(TAB) ?? ''
  const board = query.get(BOARD)
  return {
    ...(placed ? { centre: [lon, lat] as const, zoom } : {}),
    ...(angled && within(bearing, -180, 180) ? { bearing } : {}),
    ...(angled && within(pitch, 0, MAX_PITCH) ? { pitch } : {}),
    hidden,
    ...(hide.includes('aircraft') ? { aircraftHidden: true } : {}),
    ...(panel ? { panel } : {}),
    ...(panel?.kind === 'stop' && isStopBoard(board) && board !== STOP_BOARDS[0] ? { board } : {}),
    ...(isTab(tab) && tab !== SHEET_TABS[0] ? { tab } : {}),
  }
}

/** The panel a query opens: the first of `stop`, `trip` and `aircraft` it names, if any. */
function panelOf(query: URLSearchParams): Panel | undefined {
  for (const [name, value] of query) {
    const kind = KINDS.find((each) => PANELS[each] === name)
    if (kind && value) return { kind, id: value }
  }
  return undefined
}

/** The closest zoom MapLibre draws. */
const MAX_ZOOM = 24

/** The most the map tilts, in degrees, before the view is mostly sky and far-off streets. */
export const MAX_PITCH = 60

/** Whether `value` is a number from `low` to `high`; NaN is not. */
const within = (value: number, low: number, high: number) => value >= low && value <= high

const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value)

/** Whether `value` names one of the sheet's tabs. */
export const isTab = (value: string | null): value is SheetTab =>
  (SHEET_TABS as readonly (string | null)[]).includes(value)

/** `search` with the view written into it, every other parameter kept in its place. */
export function searchWith(search: string, view: MapView): string {
  const query = new URLSearchParams(search)
  const put = (name: string, value: string | undefined) =>
    value ? query.set(name, value) : query.delete(name)
  put(MAP, placeOf(view))
  put(HIDE, MAP_FILTERS.filter((filter) => hides(view, filter)).join(','))
  for (const kind of KINDS) put(PANELS[kind], view.panel?.kind === kind ? view.panel.id : undefined)
  // After the panel's own, so a link reads `?stop=<id>&board=arrivals`.
  query.delete(BOARD)
  put(BOARD, view.panel?.kind === 'stop' && view.board !== STOP_BOARDS[0] ? view.board : undefined)
  put(TAB, view.tab === SHEET_TABS[0] ? undefined : view.tab)
  const written = readableQuery(query)
  return written ? `?${written}` : ''
}

/**
 * The view's `map=`: its place, then its heading and tilt while either is off flat and north-up at
 * the tenth of a degree the address keeps, so a flat link stays as short as before 3D.
 */
function placeOf({ centre, zoom, bearing = 0, pitch = 0 }: MapView): string | undefined {
  if (!centre || zoom === undefined) return undefined
  const place = `${zoom.toFixed(2)}/${centre[1].toFixed(5)}/${centre[0].toFixed(5)}`
  // Through a number and back, so a heading a hair west of north is 0.0, not -0.0.
  const [heading, tilt] = [bearing, pitch].map((angle) => Number(angle.toFixed(1)))
  return heading === 0 && tilt === 0 ? place : `${place}/${heading.toFixed(1)}/${tilt.toFixed(1)}`
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
 * Whether the Planes filter keeps the aircraft off the map, for a component: it renders again when
 * the filter turns, not when the map moves. The prerendered page shows them.
 */
export function useAircraftHidden(store: ViewStore = mapView): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().aircraftHidden === true,
    () => false,
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

/**
 * Opens a panel in the address, closing whichever was open, a stop on its first list, Departures;
 * none closes it.
 */
export const openPanel = (panel: Panel | undefined, store: ViewStore = mapView): void =>
  store.update({ panel, board: undefined })

/**
 * The open stop's list, for a component: it renders again when the list changes, not when the map
 * moves. The prerendered page opens on the first, Departures.
 */
export function useStopBoard(store: ViewStore = mapView): StopBoard {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().board ?? STOP_BOARDS[0],
    () => STOP_BOARDS[0],
  )
}

/** The sheet's open tab, for a component: it renders again when the tab changes. */
export function useSheetTab(store: ViewStore = mapView): SheetTab {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().tab ?? SHEET_TABS[0],
    () => SHEET_TABS[0],
  )
}
