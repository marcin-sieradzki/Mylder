// How the CDN caches the answers (docs/live-data.md, "Caching"): until the answer's next run is
// due, never under 5 s, then served stale for as long as the answer's policy says: the tracker's
// for 30 s while a new one is fetched and for 5 min if the app fails, the aircraft's never while
// a new one is fetched and for 1 min if the app fails (docs/aircraft.md); never by the browser
// itself.
// A 503 tells the client when to ask again, as the policy says too.
import 'server-only'

/** The least the CDN keeps an answer, in seconds, however close the next run is. */
export const MIN_CDN_SECONDS = 5

/** How long a client waits, in seconds, before asking again after a 503, unless a policy says. */
export const RETRY_AFTER = 30

/**
 * How long, in seconds, the CDN may serve an answer stale past its hold: while it fetches a new
 * one, and while the app fails; and how long a client waits after a 503 before asking again.
 */
export interface CachePolicy {
  readonly whileRevalidating: number
  readonly ifError: number
  readonly retryAfter: number
}

/**
 * The tracker's answers: stale for 30 s while a new one is fetched and for 5 min if the app
 * fails, and asked again 30 s after a 503.
 */
export const TRACKER_CACHING: CachePolicy = {
  whileRevalidating: 30,
  ifError: 300,
  retryAfter: RETRY_AFTER,
}

/**
 * The aircraft's answer: never stale while a new one is fetched, since a new one is made only
 * when a poll asks for it (ADR 0014): served stale, the first poll past its next due would get
 * the old one, see nothing new and ask again 5 s later, every snapshot costing two polls and
 * coming 15 s apart. Stale for a minute if the app fails, when its positions would be No signal
 * anyway; asked again 10 s after a 503.
 */
export const AIRCRAFT_CACHING: CachePolicy = {
  whileRevalidating: 0,
  ifError: 60,
  retryAfter: 10,
}

/**
 * The headers for an answer due again at `nextDue`: the browser keeps nothing, and the host's own
 * CDN header, which the browser never sees, holds it until then and serves it stale as `policy`
 * says.
 */
export function cacheHeaders(
  nextDue: number,
  now: number,
  policy: CachePolicy,
): Record<string, string> {
  const seconds = Math.max(MIN_CDN_SECONDS, Math.ceil((nextDue - now) / 1000))
  return {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vercel-CDN-Cache-Control': [
      `max-age=${seconds}`,
      `stale-while-revalidate=${policy.whileRevalidating}`,
      `stale-if-error=${policy.ifError}`,
    ].join(', '),
  }
}
