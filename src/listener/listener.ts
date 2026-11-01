// The listener's core (#217, ADR 0019): the SIRI-ET reader it feeds each message, the update table
// it builds from it at most once a minute, and the one route that serves that table to the
// tracker behind a token. No IO: the AMQP shell (./amqp.ts) hands it messages, the stops watcher
// (./stops.ts) its box, and the server (./server.ts) its requests.
import { createHash, timingSafeEqual } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
  siriEtReader,
  type ReaderBox,
  type ReaderLimits,
  type SiriEtMessage,
} from '../siri-et/reader.ts'
import type { DatasetCounts } from '../siri-et/table.ts'

/** The table is built at most this often, and served from its cache between. */
export const BUILD_EVERY = 60_000

/** The one route the tracker reads, and the one a health check may. */
export const TABLE_PATH = '/table'
export const HEALTH_PATH = '/health'

export interface ListenerOptions {
  /** The token the table route asks for, `MYLDER_UPDATES_TOKEN`. */
  readonly token: string
  /** The listener's version and when it started, which its table names. */
  readonly version: string
  readonly startedAt: number
  readonly now: () => number
  readonly limits?: Partial<ReaderLimits>
}

/** What the listener logs each minute: the minute's counts, and the table and reader as they stand. */
export interface MinuteLine {
  /** Each dataset's messages and their bytes, this minute. */
  readonly datasets: Readonly<Record<string, { messages: number; bytes: number }>>
  /** Journeys the reader holds, in the box or not, and those the table lists. */
  readonly held?: number
  readonly journeys?: number
  /** The table's size as served, gzipped. */
  readonly tableBytes?: number
  /** When the table served was built, and the last message's received time. */
  readonly builtAt?: number
  readonly lastMessageAt?: number
  readonly timetableVersion?: string
  /** Messages skipped as malformed or too large, and journeys skipped, this minute. */
  readonly parseFailures: { malformed: number; tooLarge: number; skippedJourneys: number }
  /** Table requests answered with the table, refused for their token, and answered 503. */
  readonly requests: { served: number; refused: number; unavailable: number }
}

export interface Listener {
  /** Takes one message as the broker delivered it. */
  receive(message: SiriEtMessage): void
  /** Takes the box's stops, at start and with each new timetable version. */
  useBox(box: ReaderBox): void
  /** The box it lists journeys by, once it has one. */
  readonly box: () => ReaderBox | undefined
  /** Answers one request: the table route, the health route, or 404. */
  handle(request: Request): Response
  /** The minute's line, counted afresh from here. */
  minute(): MinuteLine
}

/** The table as served: built at a moment, gzipped. */
interface Served {
  readonly builtAt: number
  readonly gzipped: Uint8Array<ArrayBuffer>
  readonly held: number
  readonly journeys: number
  readonly lastMessageAt?: number
  readonly timetableVersion: string
  readonly datasets: Readonly<Record<string, DatasetCounts>>
}

type Failures = MinuteLine['parseFailures']

export function createListener(options: ListenerOptions): Listener {
  const { now } = options
  const reader = siriEtReader({
    listener: { version: options.version, startedAt: options.startedAt },
    limits: options.limits,
  })
  const expected = digest(`Bearer ${options.token}`)
  let box: ReaderBox | undefined
  let served: Served | undefined
  let datasets: Record<string, { messages: number; bytes: number }> = {}
  let requests = { served: 0, refused: 0, unavailable: 0 }
  /** The reader's failure counts at the last minute line, so each line gives its minute's. */
  let failuresBefore: Failures = { malformed: 0, tooLarge: 0, skippedJourneys: 0 }

  function receive(message: SiriEtMessage) {
    const counts = (datasets[message.dataset] ??= { messages: 0, bytes: 0 })
    counts.messages++
    counts.bytes += Buffer.byteLength(message.body)
    reader.receive(message)
  }

  /** The table as served at `at`: the cached one within a minute of its build, or a new one. */
  function table(at: number): Served | undefined {
    if (!box) return undefined
    if (served && at >= served.builtAt && at - served.builtAt < BUILD_EVERY) return served
    const built = reader.table(at)
    const json = Buffer.from(JSON.stringify(built))
    served = {
      builtAt: at,
      gzipped: new Uint8Array(gzipSync(json)),
      held: built.held,
      journeys: built.journeys.length,
      ...(built.lastMessageAt !== undefined && { lastMessageAt: built.lastMessageAt }),
      timetableVersion: built.timetableVersion,
      datasets: built.datasets,
    }
    return served
  }

  function handle(request: Request): Response {
    const { pathname, search } = new URL(request.url)
    if (request.method !== 'GET' || search) return empty(404)
    if (pathname === HEALTH_PATH) return text(table(now()) ? 'ok' : 'starting')
    if (pathname !== TABLE_PATH) return empty(404)
    const given = request.headers.get('authorization')
    if (given === null || !timingSafeEqual(digest(given), expected)) {
      requests.refused++
      return empty(401)
    }
    const current = table(now())
    if (!current) {
      requests.unavailable++
      return empty(503, { 'retry-after': '60' })
    }
    requests.served++
    return new Response(current.gzipped, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'cache-control': 'no-store',
      },
    })
  }

  function minute(): MinuteLine {
    const current = table(now())
    const failures = current ? failuresOf(current.datasets) : failuresBefore
    const line: MinuteLine = {
      datasets,
      ...(current && {
        held: current.held,
        journeys: current.journeys,
        tableBytes: current.gzipped.byteLength,
        builtAt: current.builtAt,
        ...(current.lastMessageAt !== undefined && { lastMessageAt: current.lastMessageAt }),
        timetableVersion: current.timetableVersion,
      }),
      parseFailures: {
        malformed: failures.malformed - failuresBefore.malformed,
        tooLarge: failures.tooLarge - failuresBefore.tooLarge,
        skippedJourneys: failures.skippedJourneys - failuresBefore.skippedJourneys,
      },
      requests,
    }
    failuresBefore = failures
    datasets = {}
    requests = { served: 0, refused: 0, unavailable: 0 }
    return line
  }

  function useBox(next: ReaderBox) {
    box = next
    reader.useBox(next)
  }

  return { receive, useBox, box: () => box, handle, minute }
}

/** The failures every dataset's counts add up to. */
function failuresOf(datasets: Readonly<Record<string, DatasetCounts>>): Failures {
  const sum = { malformed: 0, tooLarge: 0, skippedJourneys: 0 }
  for (const counts of Object.values(datasets)) {
    sum.malformed += counts.malformed
    sum.tooLarge += counts.tooLarge
    sum.skippedJourneys += counts.skippedJourneys
  }
  return sum
}

/** A fixed-length digest, so comparing a header with the token takes the same time either way. */
const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

/** An answer with no body, so an error says nothing past its status. */
const empty = (status: number, headers: Record<string, string> = {}): Response =>
  new Response(null, { status, headers: { ...headers, 'cache-control': 'no-store' } })

const text = (body: string): Response =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
  })
