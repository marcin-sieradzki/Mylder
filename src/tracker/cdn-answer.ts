// The answers every feed's routes build, knowing no feed: a value held by the CDN until it is
// due and then served stale as its policy says, a 404 for none, and a 503 when it can't be read.
import 'server-only'
import { cacheHeaders, RETRY_AFTER, type CachePolicy } from './caching.ts'

/** A 503 for the `what` that could not be read, logged, to be asked again in `retryAfter` s. */
export const unavailable = (error: unknown, what: string, retryAfter = RETRY_AFTER) => {
  console.error(`Could not answer the ${what}`, error)
  return new Response(null, {
    status: 503,
    headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' },
  })
}

export const notFound = (what: string) =>
  Response.json(
    { error: `unknown ${what}` },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  )

/** A value due again at its `nextDue`, or none, and the moment it was read on. */
export interface Reading<A extends { readonly nextDue: number }> {
  readonly value: A | undefined
  readonly now: number
}

/**
 * Answers with the value `produce` reads, held by the CDN until it is due and then served stale
 * as `policy` says, or 404 when there is none, or 503, to be asked again when `policy` says,
 * when `produce` fails. Its date header is the moment the value was read, which the browser
 * takes as the server's clock.
 */
export async function cdnAnswer<A extends { readonly nextDue: number }>(
  what: string,
  produce: () => Promise<Reading<A>>,
  policy: CachePolicy,
): Promise<Response> {
  try {
    const { value, now } = await produce()
    if (!value) return notFound(what)
    return Response.json(value, {
      headers: { ...cacheHeaders(value.nextDue, now, policy), Date: new Date(now).toUTCString() },
    })
  } catch (error) {
    return unavailable(error, what, policy.retryAfter)
  }
}
