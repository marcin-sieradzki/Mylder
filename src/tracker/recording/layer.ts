// The recorded Rejseplanen (docs/testing-seams.md, "The API"): an `HttpClient` that replays a
// recording folder. Each service's files answer its calls in order (`journeyPos/0001.json`,
// `0002.json`, ...), a file may describe a failure instead of an answer, and a service with no
// files left repeats its last one.
import 'server-only'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import { SERVICES, serviceOf, type Service } from '../rejseplanen/answers.ts'
import * as Http from '../rejseplanen/http.ts'

/** Where the recordings live, from the project's root. */
export const RECORDINGS_DIR = 'recordings'

/**
 * One recorded call as its file holds it: a failure, `{ "status": 503 }` with the body that came
 * with it if any, or `{ "timeout": true }`; anything else is the body of a 200.
 */
export type Recorded =
  | { readonly status: number; readonly body?: unknown }
  | { readonly timeout: true }
  | { readonly answer: unknown }

/** A recording's calls, each service's in the order they were made. */
export type Calls = ReadonlyMap<Service, readonly Recorded[]>

/** What a recording starts at: `clock.json`'s moment. */
export interface RecordingClock {
  readonly start: string
}

const FAILURE_KEYS = new Set(['status', 'body', 'timeout'])

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
  const failure = content as { status?: unknown; body?: unknown; timeout?: unknown }
  if (failure.timeout === true && keys.length === 1) return { timeout: true }
  if (Number.isInteger(failure.status) && failure.timeout === undefined) {
    const status = failure.status as number
    return 'body' in failure ? { status, body: failure.body } : { status }
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
  const { status, body } = recorded
  return Effect.succeed(
    typeof body === 'string' || body === undefined
      ? Http.text(request, status, body ?? '')
      : Http.json(request, status, body),
  )
}

/** An `HttpClient` that replays calls: each service's next one, and its last once none are left. */
export function recordedClient(calls: Calls): Http.HttpClient.HttpClient {
  const made = new Map<Service, number>()
  return Http.client((request, url) =>
    Effect.suspend(() => {
      const service = serviceOf(url)
      const recorded = service ? (calls.get(service) ?? []) : []
      if (!service || recorded.length === 0) {
        return Effect.succeed(
          Http.error(request, 400, 'SVC_PARAM', `The recording has no ${url.pathname}`),
        )
      }
      const index = made.get(service) ?? 0
      made.set(service, index + 1)
      return answer(request, recorded[Math.min(index, recorded.length - 1)])
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

/** A call's file in its service's folder, by its place in call order from 0: `0001.json` first. */
export const callFile = (index: number) => `${String(index + 1).padStart(4, '0')}.json`

export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(/* turbopackIgnore: true */ path, 'utf8'))

/** A recording folder's calls, each service's files in the order their names sort. */
export async function readCalls(dir: string): Promise<Calls> {
  const calls = new Map<Service, Recorded[]>()
  for (const service of SERVICES) {
    const folder = join(/* turbopackIgnore: true */ dir, service)
    const names = await readdir(/* turbopackIgnore: true */ folder).catch(() => [])
    const files = names.filter((name) => name.endsWith('.json')).sort()
    if (files.length === 0) continue
    calls.set(
      service,
      await Promise.all(
        files.map(async (name) => readRecorded(await readJson(join(folder, name)))),
      ),
    )
  }
  return calls
}

/** The moment a recording starts at, from its `clock.json`. */
export async function readStart(dir: string): Promise<number> {
  const { start } = (await readJson(join(dir, 'clock.json'))) as RecordingClock
  const moment = Date.parse(start)
  if (Number.isNaN(moment)) throw new Error(`${dir}/clock.json has no start moment`)
  return moment
}

/** The recorded Rejseplanen for a folder, as the layer that provides the tracker's `HttpClient`. */
export const layer = (dir: string): Layer.Layer<Http.HttpClient.HttpClient> =>
  Layer.effect(Http.HttpClient.HttpClient)(
    Effect.promise(() => readCalls(dir)).pipe(Effect.map(recordedClient)),
  )
