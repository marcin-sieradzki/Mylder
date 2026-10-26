// The route handlers' answers, built here so the routes in `app/api/` stay one line each: each
// carries the CDN header for its snapshot, read on the tracker's own clock, which a recording
// sets. A snapshot that can't be built at all, because the timetable can't be read, is a 503.
// Their core, `cdnAnswer`, takes any value with a next due, so another feed answers the same way.
// The timetable files the browser loads come from the folder the tracker's timetable is read
// from, each version kept for good.
import 'server-only'
import { Effect } from 'effect'
import { cacheHeaders, RETRY_AFTER, TRACKER_STALE, type StalePolicy } from './caching.ts'
import { runTracker, timetableDirOf, type RunTracker } from './runtime.ts'
import { readSource, type Source } from './source.ts'
import {
  filesIn,
  isBrowserFile,
  readBrowserFile,
  readManifestFile,
  type ReadTimetableFile,
} from './timetable.ts'
import type { TrackerShape } from './tracker.ts'

export const unavailable = (error: unknown) => {
  console.error('The tracker could not answer', error)
  return new Response(null, {
    status: 503,
    headers: { 'Retry-After': String(RETRY_AFTER), 'Cache-Control': 'no-store' },
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
 * as `stale` says, or 404 when there is none, or 503 when `produce` fails. Its date header is
 * the moment the value was read, which the browser takes as the server's clock.
 */
export async function cdnAnswer<A extends { readonly nextDue: number }>(
  what: string,
  produce: () => Promise<Reading<A>>,
  stale: StalePolicy,
): Promise<Response> {
  try {
    const { value, now } = await produce()
    if (!value) return notFound(what)
    return Response.json(value, {
      headers: { ...cacheHeaders(value.nextDue, now, stale), Date: new Date(now).toUTCString() },
    })
  } catch (error) {
    return unavailable(error)
  }
}

/** The tracker's four answers, each run by `run`: this instance's runtime, or the demo's (ADR 0013). */
export function trackerAnswers(run: RunTracker) {
  /**
   * Answers with what `get` reads from the tracker, dated on the tracker's clock: under a
   * recording, the recording's moment.
   */
  const answer = <A extends { readonly nextDue: number }>(
    what: string,
    get: (tracker: TrackerShape) => Effect.Effect<A | undefined>,
  ): Promise<Response> =>
    cdnAnswer(
      what,
      () => run((tracker) => Effect.all({ value: get(tracker), now: tracker.now })),
      TRACKER_STALE,
    )

  return {
    snapshot: () => answer('snapshot', (tracker) => tracker.getSnapshot),
    stop: (stopId: string) => answer('stop', (tracker) => tracker.getStopDepartures(stopId)),
    trip: (tripKey: string) => answer('trip', (tracker) => tracker.getTripDetail(tripKey)),
    disruptions: () => answer('disruptions', (tracker) => tracker.getDisruptions),
  }
}

const answers = trackerAnswers(runTracker)

export const snapshotResponse = answers.snapshot

export const stopResponse = answers.stop

export const tripResponse = answers.trip

export const disruptionsResponse = answers.disruptions

/**
 * The source the environment names, read at request time as the tracker's is; one it can't read
 * throws, inside each route's try so it answers 503 as the tracker's routes do.
 */
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
export const timetableManifestResponse = (source?: Source): Promise<Response> =>
  manifestResponse(sourceFiles(source))

/**
 * One of the files of a version the browser loads (`manifest`, `stops`, `patterns`, `paths` or
 * `dayProfiles`); 404 for the trips, any other name, or a version the folder doesn't hold.
 */
export const timetableFileResponse = (
  version: string,
  file: string,
  source?: Source,
): Promise<Response> => browserFileResponse(sourceFiles(source), version, file)

/**
 * The files of a source's timetable folder: a recording's own, or the deployed one. The source is
 * read at each read, inside the route's try.
 */
const sourceFiles =
  (source?: Source): ReadTimetableFile =>
  (file) =>
    filesIn(timetableDirOf(source ?? environmentSource()))(file)

/** The manifest from a timetable folder's files. */
export async function manifestResponse(read: ReadTimetableFile): Promise<Response> {
  try {
    return json(await readManifestFile(read), BRIEFLY)
  } catch (error) {
    return unavailable(error)
  }
}

/** One of the files of a version the browser loads, from a timetable folder's files. */
export async function browserFileResponse(
  read: ReadTimetableFile,
  version: string,
  file: string,
): Promise<Response> {
  if (!isBrowserFile(file)) return notFound('timetable file')
  try {
    const body = await readBrowserFile(read, version, file)
    return body === undefined ? notFound('timetable version') : json(body, IMMUTABLE)
  } catch (error) {
    return unavailable(error)
  }
}
