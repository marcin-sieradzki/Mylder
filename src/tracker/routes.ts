// The route handlers' answers, built here so the routes in `app/api/` stay one line each: each
// carries the CDN header for its snapshot, read on the tracker's own clock, which a recording
// sets. A snapshot that can't be built at all, because the timetable can't be read, is a 503.
import 'server-only'
import { Effect } from 'effect'
import { cacheHeaders, RETRY_AFTER } from './caching.ts'
import { runTracker } from './runtime.ts'

const unavailable = (error: unknown) => {
  console.error('The tracker could not answer', error)
  return new Response(null, {
    status: 503,
    headers: { 'Retry-After': String(RETRY_AFTER), 'Cache-Control': 'no-store' },
  })
}

const notFound = (what: string) =>
  Response.json(
    { error: `unknown ${what}` },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  )

/** Answers with a value due again at its `nextDue`, or 404 when there is none. */
async function answer<A extends { readonly nextDue: number }>(
  what: string,
  get: Parameters<typeof runTracker<A | undefined>>[0],
): Promise<Response> {
  try {
    const [value, now] = await runTracker((tracker) => Effect.all([get(tracker), tracker.now]))
    if (!value) return notFound(what)
    return Response.json(value, { headers: cacheHeaders(value.nextDue, now) })
  } catch (error) {
    return unavailable(error)
  }
}

export const snapshotResponse = () => answer('snapshot', (tracker) => tracker.getSnapshot)

export const stopResponse = (stopId: string) =>
  answer('stop', (tracker) => tracker.getStopDepartures(stopId))

export const tripResponse = (tripKey: string) =>
  answer('trip', (tracker) => tracker.getTripDetail(tripKey))

export const disruptionsResponse = () => answer('disruptions', (tracker) => tracker.getDisruptions)
