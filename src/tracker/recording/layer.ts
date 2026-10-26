// A recorded API (docs/testing-seams.md, "The API"): an `HttpClient` that replays a recording
// folder, for any API that says which folder a call's URL names. Each folder's files answer its
// calls in order (`journeyPos/0001.json`, `0002.json`, ...), a file may describe a failure
// instead of an answer, and a folder with no files left repeats its last one, or, in the demo's
// loop, starts again from its first.
import 'server-only'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import * as Http from '../http.ts'

/** Where the recordings live, from the project's root. */
export const RECORDINGS_DIR = 'recordings'

/**
 * One recorded call as its file holds it: a failure, `{ "status": 503 }` with the body and the
 * headers that came with it if any, such as a 429's `Retry-After`, or `{ "timeout": true }`;
 * anything else is the body of a 200.
 */
export type Recorded =
  | {
      readonly status: number
      readonly body?: unknown
      readonly headers?: Readonly<Record<string, string>>
    }
  | { readonly timeout: true }
  | { readonly answer: unknown }

/** A recording's calls, by folder, each folder's in the order they were made. */
export type Calls = ReadonlyMap<string, readonly Recorded[]>

/** An API as a recording keeps it: Rejseplanen's is `RECORDED_REJSEPLANEN`. */
export interface RecordedApi {
  /** The folders its calls are kept in, one for each kind of call. */
  readonly folders: readonly string[]
  /** The folder a request's URL calls, if any. */
  readonly folderOf: (url: URL) => string | undefined
  /** Its answer to a call the recording has no folder for. */
  readonly unknown: (request: Http.Request, url: URL) => Http.Response
}

/** What a recording starts at: `clock.json`'s moment. */
export interface RecordingClock {
  readonly start: string
}

const FAILURE_KEYS = new Set(['status', 'body', 'headers', 'timeout'])

/** Whether a recorded failure's headers are names and their text values. */
const isHeaders = (headers: unknown): headers is Readonly<Record<string, string>> =>
  typeof headers === 'object' &&
  headers !== null &&
  !Array.isArray(headers) &&
  Object.values(headers).every((value) => typeof value === 'string')

/**
 * A file's content as a recorded call: a failure when it has only a failure's keys, and an error
 * when those don't make one, rather than a mistyped failure served as a 200.
 */
export function readRecorded(content: unknown): Recorded {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return { answer: content }
  }
  const keys = Object.keys(content)
  if (keys.length === 0 || !keys.every((key) => FAILURE_KEYS.has(key))) return { answer: content }
  const failure = content as {
    status?: unknown
    body?: unknown
    headers?: unknown
    timeout?: unknown
  }
  if (failure.timeout === true && keys.length === 1) return { timeout: true }
  if (
    Number.isInteger(failure.status) &&
    failure.timeout === undefined &&
    (failure.headers === undefined || isHeaders(failure.headers))
  ) {
    const status = failure.status as number
    return {
      status,
      ...('body' in failure ? { body: failure.body } : {}),
      ...(failure.headers === undefined ? {} : { headers: failure.headers }),
    }
  }
  throw new Error(`Not a recorded failure: ${JSON.stringify(content)}`)
}

/** A recorded call as its file holds it: the inverse of `readRecorded`. */
export const fileContent = (recorded: Recorded): unknown =>
  'answer' in recorded ? recorded.answer : recorded

/** The answer a recorded call gives a request. */
export function answer(request: Http.Request, recorded: Recorded): Effect.Effect<Http.Response> {
  if ('answer' in recorded) return Effect.succeed(Http.json(request, 200, recorded.answer))
  if ('timeout' in recorded) return Http.gatewayTimeout(request)
  const { status, body, headers } = recorded
  return Effect.succeed(
    typeof body === 'string' || body === undefined
      ? Http.text(request, status, body ?? '', headers)
      : Http.json(request, status, body, headers),
  )
}

/**
 * What a folder answers once its calls have all been made: its last call again, as the server's
 * recordings do, or its calls again from the first, as the demo's planes do (ADR 0013).
 */
export type WhenDone = 'repeat-last' | 'loop'

/**
 * An `HttpClient` that replays calls: each folder's next one, and once none are left, as
 * `whenDone` says. A call the API files under a folder it doesn't list is the API's mistake, and
 * dies.
 */
export function recordedClient(
  api: RecordedApi,
  calls: Calls,
  whenDone: WhenDone = 'repeat-last',
): Http.HttpClient.HttpClient {
  const made = new Map<string, number>()
  return Http.client((request, url) =>
    Effect.suspend(() => {
      const folder = api.folderOf(url)
      if (folder !== undefined && !api.folders.includes(folder)) {
        return Effect.die(
          new Error(
            `The recorded API files ${url.pathname} under ${folder}, which is not one of its ` +
              `folders: ${api.folders.join(', ')}`,
          ),
        )
      }
      const recorded = folder ? (calls.get(folder) ?? []) : []
      if (!folder || recorded.length === 0) return Effect.succeed(api.unknown(request, url))
      const index = made.get(folder) ?? 0
      made.set(folder, index + 1)
      const at =
        whenDone === 'loop' ? index % recorded.length : Math.min(index, recorded.length - 1)
      return answer(request, recorded[at])
    }),
  )
}

/** A recording's folder by its name, which can't climb out of the recordings. */
export function recordingDir(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`A recording's name is lowercase letters, digits and dashes, not "${name}"`)
  }
  return join(/* turbopackIgnore: true */ process.cwd(), RECORDINGS_DIR, name)
}

/** A call's file in its folder, by its place in call order from 0: `0001.json` first. */
export const callFile = (index: number) => `${String(index + 1).padStart(4, '0')}.json`

/** Whether a file in a folder is one of its calls, `0001.json` and on, rather than its clock. */
export const isCallFile = (name: string) => /^\d+\.json$/.test(name)

export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(/* turbopackIgnore: true */ path, 'utf8'))

/**
 * How a recording's files are read: from its folder on the server, or, in the demo's worker,
 * from the files bundled with it.
 */
export interface RecordingFiles {
  /** The names of the files in a folder; none when there is no such folder. */
  readonly list: (folder: string) => Promise<readonly string[]>
  /** A file's content, parsed. */
  readonly read: (path: string) => Promise<unknown>
}

/** A recording's files in its folder, through Node's file system. */
export const filesOnDisk: RecordingFiles = {
  list: (folder) =>
    readdir(/* turbopackIgnore: true */ folder).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }),
  read: readJson,
}

/**
 * A recording's files bundled by their paths, as Vite's `import.meta.glob` gives them, each
 * already parsed: what the demo's worker reads its planes from (ADR 0013).
 */
export const bundledFiles = (bundle: Readonly<Record<string, unknown>>): RecordingFiles => ({
  list: async (folder) =>
    Object.keys(bundle)
      .filter((path) => path.startsWith(`${folder}/`))
      .map((path) => path.slice(folder.length + 1))
      .filter((name) => !name.includes('/')),
  read: async (path) => {
    if (!(path in bundle)) throw new Error(`The bundled recording has no ${path}`)
    return bundle[path]
  },
})

/**
 * A recording folder's calls to an API, each folder's files in the order their names sort, read
 * from its folder unless `files` says otherwise. A folder that isn't there has no calls; one that
 * can't be read fails.
 */
export async function readCalls(
  api: RecordedApi,
  dir: string,
  files: RecordingFiles = filesOnDisk,
): Promise<Calls> {
  const calls = new Map<string, Recorded[]>()
  for (const name of api.folders) {
    const folder = join(/* turbopackIgnore: true */ dir, name)
    const names = (await files.list(folder)).filter(isCallFile).sort()
    if (names.length === 0) continue
    calls.set(
      name,
      await Promise.all(
        names.map(async (file) => readRecorded(await files.read(join(folder, file)))),
      ),
    )
  }
  return calls
}

/**
 * The moment a recording starts at, from its `clock.json`; or a folder's, from the folder's own
 * `clock.json` when it has one, as `aircraft/` does for answers recorded on another day.
 */
export async function readStart(dir: string, folder?: string): Promise<number> {
  const ownClock =
    folder !== undefined && (await filesOnDisk.list(join(dir, folder))).includes('clock.json')
  const path = ownClock ? join(dir, folder, 'clock.json') : join(dir, 'clock.json')
  const { start } = (await readJson(path)) as RecordingClock
  const moment = Date.parse(start)
  if (Number.isNaN(moment)) throw new Error(`${path} has no start moment`)
  return moment
}

export interface RecordedLayerOptions {
  /** How the folder's files are read: from disk unless given. */
  readonly files?: RecordingFiles
  /** What a folder answers once its calls are made: its last again unless given. */
  readonly whenDone?: WhenDone
}

/** A recorded API for a folder, as the layer that provides the tracker's `HttpClient`. */
export const layer = (
  api: RecordedApi,
  dir: string,
  { files, whenDone }: RecordedLayerOptions = {},
): Layer.Layer<Http.HttpClient.HttpClient> =>
  Layer.effect(Http.HttpClient.HttpClient)(
    Effect.promise(() => readCalls(api, dir, files)).pipe(
      Effect.map((calls) => recordedClient(api, calls, whenDone)),
    ),
  )
