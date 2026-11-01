// The box's stops (#217): the listener learns them from the app's own public timetable routes, the
// manifest and the stops file of the version it names, so it needs no copy of the timetable and
// the daily timetable job never redeploys it. When the app can't be reached it keeps what it has.
import { boxOf } from '../siri-et/box.ts'
import type { Listener } from './listener.ts'
import type { Log } from './log.ts'

/** How often the manifest is checked for a new version once the listener has a set. */
export const STOPS_EVERY = 15 * 60_000

/** How often it is tried while the listener has none yet, and so serves 503. */
export const STOPS_RETRY = 60_000

/** How long one of the app's answers may take. */
const APP_TIMEOUT = 10_000

export interface StopsOptions {
  /** The app's public URL, `MYLDER_APP_URL`. */
  readonly appUrl: string
  readonly fetch: typeof globalThis.fetch
  readonly listener: Pick<Listener, 'box' | 'useBox'>
  readonly log: Log
}

/**
 * Reads the app's manifest, and when it names a version other than the listener's, that version's
 * stops, which become the listener's box. A failure keeps the box it has, and is logged.
 */
export async function checkStops({ appUrl, fetch, listener, log }: StopsOptions): Promise<void> {
  const held = listener.box()?.timetableVersion
  try {
    const manifest = await json(fetch, new URL('/api/timetable', appUrl))
    const version = (manifest as { version?: unknown }).version
    if (typeof version !== 'string') throw new Error('the manifest names no version')
    if (version === held) return
    const stops = await json(
      fetch,
      new URL(`/api/timetable/${encodeURIComponent(version)}/stops`, appUrl),
    )
    const box = boxOf(manifest, stops)
    listener.useBox(box)
    log({
      level: 'info',
      message: `The listener lists journeys by timetable ${version}'s stops`,
      stops: box.stops.size,
    })
  } catch (error) {
    log({
      level: 'warn',
      message: `The listener couldn’t read the app’s timetable (${messageOf(error)}); it ${
        held ? `keeps ${held}'s stops` : 'has no stops yet, so its table route answers 503'
      }`,
    })
  }
}

async function json(fetch: typeof globalThis.fetch, url: URL): Promise<unknown> {
  const answer = await fetch(url.href, { signal: AbortSignal.timeout(APP_TIMEOUT) })
  if (!answer.ok) throw new Error(`${url.pathname} answered ${answer.status}`)
  return answer.json()
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
