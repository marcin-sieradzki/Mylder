// Where the tracker's updates come from, picked by `MYLDER_UPDATES` at request time
// (docs/testing-seams.md, "The update switch"), apart from `MYLDER_SOURCE`, so delays work on the
// timetable source now and on Rejseplanen's later (spec #146): off (the default), SIRI-ET's update
// table fetched from the listener over HTTPS, or the SIRI-ET reader run inside the tracker over a
// recording's messages.
import 'server-only'
import { join } from 'node:path'
import { Cause, Clock, Context, Effect, Layer, Option, Result, Schema } from 'effect'
import type { Call } from '../domain/trip-motion.ts'
import { siriEtReader } from '../siri-et/reader.ts'
import { readBox, siriEtReplay } from '../siri-et/recording.ts'
import { UpdateTable, type DelayStep } from '../siri-et/table.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import * as Http from './http.ts'
import { callIndexOf, joinTableJourney } from './join.ts'
import { recordingDir } from './recording/layer.ts'
import type { Timetable } from './timetable.ts'

/** Where updates come from: none, the listener's table over HTTPS, or a recording's messages. */
export type Updates =
  | { readonly kind: 'off' }
  | { readonly kind: 'siri' }
  | {
      readonly kind: 'recording'
      readonly folder: string
      /**
       * A saved moment of the recording, a folder of it with a `clock.json` of its own, whose
       * clock the runtime starts at instead of the recording's, such as `quiet`, a few minutes
       * before its messages end.
       */
      readonly moment?: string
    }

/** The variable that picks where updates come from. */
export const UPDATES_VARIABLE = 'MYLDER_UPDATES'

const OFF: Updates = { kind: 'off' }

/** A recording's folder, or a saved moment's in it: lowercase letters, digits and dashes. */
const FOLDER_NAME = /^[a-z0-9][a-z0-9-]*$/

/**
 * Reads `MYLDER_UPDATES`: `off` (the default, when it is unset or empty, so local runs and tests
 * need no listener), `siri`, `recording:<folder>` or `recording:<folder>/<moment>`. Anything else
 * is a mistake worth stopping for.
 */
export function readUpdates(value: string | undefined): Updates {
  const setting = value?.trim() ?? ''
  if (setting === '' || setting === 'off') return OFF
  if (setting === 'siri') return { kind: 'siri' }
  const [kind, ...rest] = setting.split(':')
  const [folder = '', moment, ...more] = rest.join(':').split('/')
  if (
    kind === 'recording' &&
    FOLDER_NAME.test(folder) &&
    (moment === undefined || FOLDER_NAME.test(moment)) &&
    more.length === 0
  ) {
    return { kind: 'recording', folder, ...(moment === undefined ? {} : { moment }) }
  }
  throw new Error(
    `${UPDATES_VARIABLE}="${setting}" is none of off, siri, recording:<folder> or recording:<folder>/<moment>`,
  )
}

/** The variables that name the listener's table route and the token it asks for. */
export const LISTENER_URL_VARIABLE = 'MYLDER_UPDATES_URL'
export const LISTENER_TOKEN_VARIABLE = 'MYLDER_UPDATES_TOKEN'

/** Where the tracker fetches the listener's table: its route's whole URL, and the token it asks for. */
export interface ListenerAddress {
  readonly url: string
  readonly token: string
}

/** The listener's address from the environment, or undefined when either variable is missing. */
export function readListener(
  env: Readonly<Record<string, string | undefined>>,
): ListenerAddress | undefined {
  const url = env[LISTENER_URL_VARIABLE]?.trim()
  const token = env[LISTENER_TOKEN_VARIABLE]?.trim()
  return url && token ? { url, token } : undefined
}

/** The variable's value as it was set, for a log line. */
export const updatesSetting = (updates: Updates): string =>
  updates.kind === 'recording'
    ? `recording:${updates.folder}${updates.moment === undefined ? '' : `/${updates.moment}`}`
    : updates.kind

/** What the tracker reads its updates from: the table at a moment, or none. */
export interface UpdateFeedShape {
  readonly updates: Updates
  /**
   * The update table at `now`: the listener's, one fetch a run, or the reader's over
   * a recording's messages received by then; undefined when updates are off or the table is gone.
   */
  readonly table: (now: number) => Effect.Effect<UpdateTable | undefined>
}

export class UpdateFeed extends Context.Service<UpdateFeed, UpdateFeedShape>()(
  'mylder/tracker/UpdateFeed',
) {}

/**
 * The SIRI-ET reader inside the tracker, over a recording's messages: each table hands it the
 * messages received since the last, so the table follows the clock, as the listener's would.
 */
const fromRecording = (folder: string) =>
  Effect.gen(function* () {
    const dir = recordingDir(folder)
    const startedAt = yield* Clock.currentTimeMillis
    const [due, box] = yield* Effect.promise(() =>
      Promise.all([siriEtReplay(join(dir, 'messages.jsonl.gz')), readBox(join(dir, 'timetable'))]),
    )
    const reader = siriEtReader({ box, listener: { version: `recording:${folder}`, startedAt } })
    return (now: number) =>
      Effect.sync(() => {
        for (const message of due(now)) reader.receive(message)
        return reader.table(now)
      })
  })

/** How long the tracker waits for the listener's table before it runs without. */
export const LISTENER_TIMEOUT = '3 seconds'

/**
 * The most of an answer the tracker reads, unzipped: about nine times the 895 KB of JSON the
 * recorded Saturday's table reached at 09:56 (docs/live-data.md, "The update table"), room for a
 * weekday peak. A longer answer is no table, and the rest of it is never read.
 */
export const TABLE_MAX_BYTES = 8 * 1024 * 1024

/** A table built longer ago than this is a stuck listener's, and counts as none. */
export const TABLE_MAX_AGE = 10 * 60_000

const decodeTable = Schema.decodeUnknownOption(UpdateTable)

/**
 * The listener's table, fetched once a run with its token (ADR 0019), or undefined when the fetch
 * times out, fails or is refused, or the table is older than 10 minutes or fails its schema, such
 * as a table of another version. Each of those is logged, never with the token, and none fails the
 * run: its trips stay or turn as rule 3 of docs/data-states.md says.
 */
export const readUpdateTable = (
  client: Http.HttpClient.HttpClient,
  listener: ListenerAddress | undefined,
  now: number,
): Effect.Effect<UpdateTable | undefined> =>
  Effect.gen(function* () {
    const without = (why: string) =>
      Effect.as(
        Effect.logWarning(`The listener’s table ${why}; delays are left out this run`),
        undefined,
      )
    if (!listener) {
      return yield* Effect.as(
        Effect.logError(
          `MYLDER_UPDATES=siri needs ${LISTENER_URL_VARIABLE} and ${LISTENER_TOKEN_VARIABLE}; delays are left out`,
        ),
        undefined,
      )
    }
    if (!sendsTokenSafely(listener.url)) {
      return yield* Effect.as(
        Effect.logError(
          `${LISTENER_URL_VARIABLE} isn’t an https URL, or plain http on this machine, so the token isn’t sent; delays are left out`,
        ),
        undefined,
      )
    }
    const authorization = `Bearer ${listener.token}`
    const answer = yield* Http.getTextUpTo(client, listener.url, TABLE_MAX_BYTES, {
      authorization,
    }).pipe(Effect.timeout(LISTENER_TIMEOUT), Effect.result)
    if (Result.isFailure(answer)) {
      const failure = answer.failure
      return yield* Cause.isTimeoutError(failure)
        ? without(`took over ${LISTENER_TIMEOUT}`)
        : without(`couldn’t be fetched: ${withoutToken(failure.message, listener.token)}`)
    }
    const { status, text, tooLarge } = answer.success
    if (tooLarge) return yield* without(`is over ${TABLE_MAX_BYTES / 1024 / 1024} MB`)
    if (status !== 200) {
      return yield* Effect.as(
        Effect.logWarning(`The listener answered ${status}; delays are left out this run`),
        undefined,
      )
    }
    const body = parseJson(text)
    const table = decodeTable(body)
    if (Option.isNone(table)) {
      // Only a version that is a number is logged; nothing else of the answer is.
      const version = (body as { version?: unknown } | null | undefined)?.version
      return yield* without(
        Number.isSafeInteger(version)
          ? `fails its schema (version ${version})`
          : 'fails its schema',
      )
    }
    if (now - table.value.writtenAt > TABLE_MAX_AGE) {
      return yield* without(
        `was built at ${new Date(table.value.writtenAt).toISOString()}, over 10 minutes ago`,
      )
    }
    return table.value
  })

/** Whether a URL is one the token may go to: https, or plain http to this machine. */
function sendsTokenSafely(url: string): boolean {
  if (!URL.canParse(url)) return false
  const { protocol, hostname } = new URL(url)
  return (
    protocol === 'https:' ||
    (protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname))
  )
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** A message with the token cut out, should a client ever echo a header. */
const withoutToken = (message: string, token: string): string =>
  message.split(token).join('<token>')

/**
 * The feed `updates` sets up; the listener's table is fetched from `listener` through the client
 * provided.
 */
export const feedLayer = (
  updates: Updates,
  listener?: ListenerAddress,
): Layer.Layer<UpdateFeed, never, Http.HttpClient.HttpClient> =>
  Layer.effect(
    UpdateFeed,
    Effect.gen(function* () {
      switch (updates.kind) {
        case 'off':
          return { updates, table: () => Effect.succeed(undefined) }
        case 'siri': {
          const client = yield* Http.HttpClient.HttpClient
          return { updates, table: (now: number) => readUpdateTable(client, listener, now) }
        }
        case 'recording':
          return { updates, table: yield* fromRecording(updates.folder) }
      }
    }),
  )

/** What one journey of the table tells its trip (spec #146). */
export interface TripUpdate {
  /** When its journey's latest message was received. */
  readonly received: number
  readonly cancelled: boolean
  /** The trip's calls, with the expected times its delays give where each changes. */
  readonly calls: readonly Call[]
  /** The indexes of the calls it won't serve. */
  readonly cancelledCalls: readonly number[]
}

/** The table joined to the trips of the timetable. */
export interface JoinedTable {
  /** By trip key, each joined trip's update. */
  readonly trips: ReadonlyMap<string, TripUpdate>
  /** The journeys that joined no trip, by the mode of their dataset. */
  readonly unmatched: Readonly<Record<string, number>>
}

/** The mode each dataset carries: Movia's buses, DSB's trains, the S-tog and Lokaltog's trains. */
const DATASET_MODES: Readonly<Record<string, string>> = {
  '788': 'bus',
  '785': 'train',
  '801': 's-tog',
  '799': 'train',
}

export const NO_UPDATES: JoinedTable = { trips: new Map(), unmatched: {} }

/**
 * Joins each journey of the table to its trip (`joinTableJourney`, ./join.ts) and gives the trip
 * its update. A journey with no delay, no cancellation and no cancelled call yet tells its trip
 * nothing, as a departure row without a prognosis is no update (src/domain/data-state.ts), so it
 * joins but gives none. An unmatched journey, such as an Extra trip's, is counted and not drawn, as
 * a position answer's is (docs/timetable.md, "The join").
 */
export function joinTable(timetable: Timetable, table: UpdateTable): JoinedTable {
  const trips = new Map<string, TripUpdate>()
  const taken = new Set<string>()
  const unmatched: Record<string, number> = {}
  for (const journey of table.journeys) {
    const held = [
      ...(journey.first ? [journey.first] : []),
      ...journey.steps,
      ...(journey.cancelledCalls ?? []),
    ]
    const trip = joinTableJourney(timetable, { ...journey, calls: held }, taken)
    if (!trip) {
      const mode = DATASET_MODES[journey.dataset] ?? `dataset ${journey.dataset}`
      unmatched[mode] = (unmatched[mode] ?? 0) + 1
      continue
    }
    taken.add(trip.key)
    const cancelled = journey.cancelled === true
    if (!cancelled && journey.steps.length === 0 && !journey.cancelledCalls) continue
    trips.set(trip.key, {
      received: journey.received,
      cancelled,
      calls: expectedCalls(timetable, trip, journey.steps),
      cancelledCalls: (journey.cancelledCalls ?? [])
        .map((call) => callIndexOf(timetable, trip, call))
        .filter((index) => index >= 0),
    })
  }
  return { trips, unmatched }
}

/**
 * A trip's calls with the expected times its delay steps give: each step's call leaves `delay`
 * seconds late (and arrives so, at its last stop), and the calls between steps take the delay of
 * the step before them as the trip moves (`timedCalls`, src/domain/trip-motion.ts).
 */
function expectedCalls(
  timetable: Timetable,
  trip: PlannedTrip,
  steps: readonly DelayStep[],
): Call[] {
  const calls: Call[] = trip.calls.map(({ arrival, departure }) => ({ arrival, departure }))
  const last = calls.length - 1
  let from = 0
  for (const step of steps) {
    const i = callIndexOf(timetable, trip, step, from)
    if (i < 0) continue
    from = i + 1
    const late = step.delay * 1000
    calls[i] = {
      ...calls[i],
      expectedDeparture: calls[i].departure + late,
      ...(i === last ? { expectedArrival: calls[i].arrival + late } : {}),
    }
  }
  return calls
}
