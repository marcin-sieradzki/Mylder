// The route handlers' answers, built here so the routes in `app/api/` stay one line each: each
// carries the CDN header for its snapshot, read on the tracker's own clock, which a recording
// sets. A snapshot that can't be built at all, because the timetable can't be read, is a 503.
// The timetable's network files come from the tracker's own timetable, each version kept for good.
import 'server-only'
import { Effect } from 'effect'
import { cacheHeaders, RETRY_AFTER } from './caching.ts'
import { runTracker, timetableDirOf } from './runtime.ts'
import { readSource, type Source } from './source.ts'
import { isNetworkFile, readManifestFile, readNetworkFile } from './timetable.ts'

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

/**
 * Answers with a value due again at its `nextDue`, or 404 when there is none. Its date header is
 * the tracker's clock, which the browser takes as the server's: under a recording, the
 * recording's moment.
 */
async function answer<A extends { readonly nextDue: number }>(
  what: string,
  get: Parameters<typeof runTracker<A | undefined>>[0],
): Promise<Response> {
  try {
    const [value, now] = await runTracker((tracker) => Effect.all([get(tracker), tracker.now]))
    if (!value) return notFound(what)
    return Response.json(value, {
      headers: { ...cacheHeaders(value.nextDue, now), Date: new Date(now).toUTCString() },
    })
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

/** The source the environment names, read at request time as the tracker's is. */
const environmentSource = (): Source => readSource(process.env.MYLDER_SOURCE)

/** A version's files never change, so anyone may keep them for good. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/** The current manifest changes with a deployment, so it is kept for a minute only. */
const BRIEFLY = 'public, max-age=60'

const json = (body: string, cacheControl: string) =>
  new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl },
  })

/** The current manifest, which the map starts from before its first snapshot. */
export async function timetableManifestResponse(
  source: Source = environmentSource(),
): Promise<Response> {
  try {
    return json(await readManifestFile(timetableDirOf(source)), BRIEFLY)
  } catch (error) {
    return unavailable(error)
  }
}

/**
 * One of a version's network files (`manifest`, `stops`, `patterns` or `paths`); 404 for the
 * trips, any other name, or a version the tracker doesn't hold.
 */
export async function timetableFileResponse(
  version: string,
  file: string,
  source: Source = environmentSource(),
): Promise<Response> {
  if (!isNetworkFile(file)) return notFound('timetable file')
  try {
    const body = await readNetworkFile(timetableDirOf(source), version, file)
    return body === undefined ? notFound('timetable version') : json(body, IMMUTABLE)
  } catch (error) {
    return unavailable(error)
  }
}
