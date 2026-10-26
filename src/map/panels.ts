// The open panel's answer (docs/screens.md, "Vehicle detail" and "Stop departures"): the stop
// route's answer for an open stop, the trip route's for an open trip, asked for when the panel
// opens in the address (view.ts) and again just after each answer falls due, while anything on the
// page watches it. One store for the page, which React reads through `useSyncExternalStore`, so
// the panels share one ask. Everything outside Mylder (the network, the timers, the server's clock,
// the random draw) comes in as a dependency.
import 'client-only'
import { useSyncExternalStore } from 'react'
import type { StopDepartures, TripDetail } from '../tracker/index.ts'
import { liveSnapshot, serverNow } from './live.ts'
import { mapView, type Panel, type PanelKind, type ViewStore } from './view.ts'

/** Each panel's answer, by what it shows. */
export interface PanelAnswers {
  readonly stop: StopDepartures
  readonly trip: TripDetail
}

/**
 * How the ask is going: on its way, answered, unknown to the route (its 404), or failed with
 * nothing to show yet. An answer kept through a failed later ask stays `ok`.
 */
export type PanelStatus = 'loading' | 'ok' | 'not-found' | 'error'

/** One kind of panel's state: the panel, and its answer once one has landed. */
export interface PanelStateOf<K extends PanelKind> {
  readonly panel: Panel & { readonly kind: K }
  readonly status: PanelStatus
  readonly answer?: PanelAnswers[K]
}

/** The open panel's state, told apart by `panel.kind`. */
export type PanelState = { [K in PanelKind]: PanelStateOf<K> }[PanelKind]

/** Whether the open panel's state is one of a kind's, for a screen that shows that kind. */
export const isPanelOf = <K extends PanelKind>(
  state: PanelState | undefined,
  kind: K,
): state is PanelStateOf<K> & PanelState => state?.panel.kind === kind

export interface PanelAnswersStore {
  /** The open panel's state; none while no panel is open. The same object until it changes. */
  get(): PanelState | undefined
  /** Calls back on every change, and asks while anything listens; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

type Timer = ReturnType<typeof setTimeout>

export interface PanelDeps {
  fetch(url: string, init: { signal: AbortSignal }): Promise<Response>
  timers: { set(run: () => void, ms: number): Timer; clear(handle: Timer): void }
  /** The server's clock, in ms since the epoch, which an answer's `nextDue` is on. */
  serverNow(): number
  /** A number from 0 up to 1, for the jitter. */
  random(): number
}

const S = 1000

/** An ask with no answer by then has failed. */
const TIMEOUT = 10 * S

/** After a failed ask, the next one. */
const RETRY = 10 * S

/** The least wait after an answer, for one already due when it lands, as one is mid-run. */
const LEAST_WAIT = 5 * S

const ROUTES: Readonly<Record<PanelKind, string>> = { stop: '/api/stops/', trip: '/api/trips/' }

/** The route that answers a panel. */
const routeOf = (panel: Panel) => `${ROUTES[panel.kind]}${encodeURIComponent(panel.id)}`

const isAnswer = (body: unknown): body is { readonly nextDue: number } =>
  typeof (body as { nextDue?: unknown } | null)?.nextDue === 'number'

const browser = (): PanelDeps => ({
  fetch: (url, init) => fetch(url, init),
  timers: {
    set: (run, ms) => setTimeout(run, ms),
    clear: (handle) => clearTimeout(handle),
  },
  serverNow: () => serverNow(liveSnapshot.get()),
  random: Math.random,
})

/** The answers for the panel open in `view`. */
export function panelAnswers(
  view: ViewStore = mapView,
  deps: PanelDeps = browser(),
): PanelAnswersStore {
  const { timers } = deps
  /** 1 to 4 s after each answer falls due, the same for the page's whole load. */
  const jitter = S + deps.random() * 3 * S
  const listeners = new Set<() => void>()
  let state: PanelState | undefined
  let timer: Timer | undefined
  let inFlight: AbortController | undefined
  let stopFollowing: (() => void) | undefined
  /** The panel being asked for. */
  let followed: Panel | undefined

  const set = (next: PanelState | undefined) => {
    state = next
    for (const listener of listeners) listener()
  }

  /** Drops the ask on its way and the one planned. */
  const halt = () => {
    if (timer !== undefined) timers.clear(timer)
    timer = undefined
    inFlight?.abort()
    inFlight = undefined
  }

  const plan = (panel: Panel, wait: number) => {
    timer = timers.set(() => void ask(panel), wait)
  }

  async function ask(panel: Panel) {
    timer = undefined
    const controller = new AbortController()
    inFlight = controller
    const timeout = timers.set(() => controller.abort(), TIMEOUT)
    let landed: { status: 'ok'; answer: { nextDue: number } } | { status: 'not-found' } | undefined
    try {
      const response = await deps.fetch(routeOf(panel), { signal: controller.signal })
      if (response.status === 404) landed = { status: 'not-found' }
      else if (response.ok) {
        const body: unknown = await response.json()
        if (isAnswer(body)) landed = { status: 'ok', answer: body }
      }
    } catch {
      // A network error or the timeout: the same failed ask as a 5xx.
    } finally {
      timers.clear(timeout)
    }
    // Closed, or another panel opened, while it was on its way: whatever came back is dropped.
    if (inFlight !== controller) return
    inFlight = undefined
    if (landed?.status === 'not-found') return set({ panel, status: 'not-found' } as PanelState)
    if (landed) {
      set({ panel, ...landed } as PanelState)
      return plan(panel, Math.max(landed.answer.nextDue - deps.serverNow(), LEAST_WAIT) + jitter)
    }
    if (state?.status !== 'ok') set({ panel, status: 'error' } as PanelState)
    plan(panel, RETRY)
  }

  /** Starts asking for the panel the view has open, when it isn't the one asked for already. */
  const follow = () => {
    const panel = view.get().panel
    if (panel === followed) return
    halt()
    followed = panel
    if (!panel) return set(undefined)
    // The same panel, followed again after nothing watched it, keeps its answer until the next.
    if (state?.panel !== panel) set({ panel, status: 'loading' } as PanelState)
    void ask(panel)
  }

  return {
    get() {
      // Nothing listens, so nothing follows the view: read its panel now, without asking.
      if (!stopFollowing) {
        const panel = view.get().panel
        if (panel !== state?.panel)
          state = panel ? ({ panel, status: 'loading' } as PanelState) : undefined
      }
      return state
    },
    subscribe(onChange) {
      listeners.add(onChange)
      if (!stopFollowing) {
        stopFollowing = view.subscribe(follow)
        follow()
      }
      return () => {
        listeners.delete(onChange)
        if (listeners.size > 0 || !stopFollowing) return
        stopFollowing()
        stopFollowing = undefined
        followed = undefined
        halt()
      }
    },
  }
}

/** The page's one store of panel answers, following the page's address. */
export const openPanelAnswers = panelAnswers()

/** The open panel's state, for a component: it renders again when the state changes. */
export function usePanelState(store: PanelAnswersStore = openPanelAnswers): PanelState | undefined {
  return useSyncExternalStore(store.subscribe, store.get, () => undefined)
}
