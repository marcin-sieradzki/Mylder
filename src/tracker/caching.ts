// How the CDN caches the tracker's answers (docs/live-data.md, "Caching"): until the snapshot's
// next run is due, never under 5 s, served stale for 30 s while a new one is fetched and for
// 5 min if the app fails; never by the browser itself.
import 'server-only'

/** The least the CDN keeps an answer, in seconds, however close the next run is. */
export const MIN_CDN_SECONDS = 5

export const STALE_WHILE_REVALIDATE = 30

export const STALE_IF_ERROR = 300

/** How long a client waits before asking again after a 503. */
export const RETRY_AFTER = 30

/**
 * The headers for an answer built from a snapshot due again at `nextDue`: the browser keeps
 * nothing, and the host's own CDN header, which the browser never sees, holds it until then.
 */
export function cacheHeaders(nextDue: number, now: number): Record<string, string> {
  const seconds = Math.max(MIN_CDN_SECONDS, Math.ceil((nextDue - now) / 1000))
  return {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vercel-CDN-Cache-Control': [
      `max-age=${seconds}`,
      `stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
      `stale-if-error=${STALE_IF_ERROR}`,
    ].join(', '),
  }
}
