// How the CDN caches the answers (docs/live-data.md, "Caching"): until the answer's next run is
// due, never under 5 s, then served stale for as long as the answer's policy says: the tracker's
// for 30 s while a new one is fetched and for 5 min if the app fails; never by the browser itself.
import 'server-only'

/** The least the CDN keeps an answer, in seconds, however close the next run is. */
export const MIN_CDN_SECONDS = 5

/**
 * How long, in seconds, the CDN may serve an answer stale past its hold: while it fetches a new
 * one, and while the app fails.
 */
export interface StalePolicy {
  readonly whileRevalidating: number
  readonly ifError: number
}

/** The tracker's answers: stale for 30 s while a new one is fetched, and for 5 min if the app fails. */
export const TRACKER_STALE: StalePolicy = { whileRevalidating: 30, ifError: 300 }

/** How long a client waits before asking again after a 503. */
export const RETRY_AFTER = 30

/**
 * The headers for an answer due again at `nextDue`: the browser keeps nothing, and the host's own
 * CDN header, which the browser never sees, holds it until then and serves it stale as `stale`
 * says.
 */
export function cacheHeaders(
  nextDue: number,
  now: number,
  stale: StalePolicy,
): Record<string, string> {
  const seconds = Math.max(MIN_CDN_SECONDS, Math.ceil((nextDue - now) / 1000))
  return {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vercel-CDN-Cache-Control': [
      `max-age=${seconds}`,
      `stale-while-revalidate=${stale.whileRevalidating}`,
      `stale-if-error=${stale.ifError}`,
    ].join(', '),
  }
}
