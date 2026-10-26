// The Rejseplanen client: one function per service Mylder calls, each decoding its answer with
// the service's schema (docs/live-data.md). Every attempt is counted in the store before it is
// sent, retries included; an attempt waits 8 s at most; a network error or a 5xx is tried once
// more, a 4xx never. Whatever answers the `HttpClient` (the real API, a recording or the
// simulation) answers here, so the tracker sees one shape.
import 'server-only'
import { Cause, Clock, Context, Effect, Layer, Option, Schema } from 'effect'
import type { Box } from '../../timetable/format.ts'
import { Store } from '../store.ts'
import {
  ErrorAnswer,
  HimSearchAnswer,
  JourneyPosAnswer,
  QUOTA_SPENT,
  REFUSED_KEY,
  type Service,
} from './answers.ts'
import * as Http from './http.ts'

/** Where Rejseplanen API 2.0 answers. */
export const BASE_URL = 'https://www.rejseplan.dk/api/'

/** How long one attempt may take before it counts as a timeout. */
export const CALL_TIMEOUT = '8 seconds'

/** How a call failed: the kinds the snapshot's API health names. */
export interface CallError {
  readonly kind: 'timeout' | 'network' | 'status' | 'body' | 'refused' | 'quota'
  readonly service: Service
  readonly status?: number
  readonly message: string
  /** How many attempts the call made before it gave up. */
  readonly attempts: number
  /** How long it ran over all its attempts, once it has given up. */
  readonly ms?: number
}

/** One call that answered, with how many attempts it took and how long it ran. */
export interface Answered<A> {
  readonly answer: A
  readonly attempts: number
  readonly ms: number
}

export interface JourneyPosQuery {
  readonly box: Box
  readonly products: number
  readonly positionMode: 'REPORT_ONLY' | 'CALC_REPORT'
  readonly maxJny: number
}

/** The disruption messages asked for: the products they concern, as a bitmask. */
export interface HimSearchQuery {
  readonly products: number
}

export interface RejseplanenShape {
  readonly journeyPos: (
    query: JourneyPosQuery,
  ) => Effect.Effect<Answered<JourneyPosAnswer>, CallError>
  readonly himsearch: (query: HimSearchQuery) => Effect.Effect<Answered<HimSearchAnswer>, CallError>
}

export class Rejseplanen extends Context.Service<Rejseplanen, RejseplanenShape>()(
  'mylder/tracker/Rejseplanen',
) {}

export interface ClientSettings {
  /** The key, sent as `accessId`; never logged. */
  readonly key?: string
  /** What the store's counters are kept under, so simulated calls never touch a live count. */
  readonly counterPrefix: string
  /** The month a moment falls in, as `YYYY-MM`, in the timetable's zone. */
  readonly monthOf: (now: number) => string
}

/** Counters are kept for two months, so the about page can show the last one. */
const COUNTER_SECONDS = 62 * 86_400

/**
 * A network error or a 5xx is worth one more try. A timeout is not: it has already spent 8 s of
 * the run, and the next minute's run asks again.
 */
const retryable = (error: CallError) =>
  error.kind === 'network' || (error.kind === 'status' && (error.status ?? 0) >= 500)

/** The store key of a month's call count, every service together, or one service's. */
export const callsKey = (prefix: string, month: string, service?: Service) =>
  `${prefix}:calls:${month}${service ? `:${service}` : ''}`

/** The answer's body as JSON, or undefined when it isn't any. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** A message with the key taken out of any URL in it. */
export const withoutKey = (message: string, key: string | undefined) =>
  key ? message.replaceAll(key, '<key>') : message

export const layer = (
  settings: ClientSettings,
): Layer.Layer<Rejseplanen, never, Http.HttpClient.HttpClient | Store> =>
  Layer.effect(
    Rejseplanen,
    Effect.gen(function* () {
      const client = yield* Http.HttpClient.HttpClient
      const store = yield* Store

      const count = (service: Service) =>
        Effect.gen(function* () {
          const month = settings.monthOf(yield* Clock.currentTimeMillis)
          yield* store.increment(callsKey(settings.counterPrefix, month), COUNTER_SECONDS)
          yield* store.increment(callsKey(settings.counterPrefix, month, service), COUNTER_SECONDS)
        })

      function call<A, I>(
        service: Service,
        schema: Schema.Codec<A, I>,
        params: Record<string, string | number>,
      ): Effect.Effect<Answered<A>, CallError> {
        let attempts = 0
        const fail = (kind: CallError['kind'], message: string, status?: number) =>
          Effect.fail<CallError>({
            kind,
            service,
            message: withoutKey(message, settings.key),
            attempts,
            ...(status === undefined ? {} : { status }),
          })
        const decode = Schema.decodeUnknownEffect(schema)
        const urlParams = {
          ...params,
          format: 'json',
          ...(settings.key ? { accessId: settings.key } : {}),
        }
        const attempt = Effect.gen(function* () {
          attempts++
          yield* count(service)
          const { status, text } = yield* Http.getText(
            client,
            `${BASE_URL}${service}`,
            urlParams,
          ).pipe(
            Effect.timeout(CALL_TIMEOUT),
            Effect.catch((error) =>
              Cause.isTimeoutError(error)
                ? fail('timeout', `${service} took over ${CALL_TIMEOUT}`)
                : fail(error.network ? 'network' : 'status', `${service}: ${error.message}`),
            ),
          )
          const body = parseJson(text)
          if (status >= 400) {
            const code = Option.getOrUndefined(
              Schema.decodeUnknownOption(ErrorAnswer)(body),
            )?.errorCode
            if (code === QUOTA_SPENT) return yield* fail('quota', `${service}: ${code}`, status)
            if (code === REFUSED_KEY) return yield* fail('refused', `${service}: ${code}`, status)
            return yield* fail(
              'status',
              `${service} answered ${status}${code ? ` ${code}` : ''}`,
              status,
            )
          }
          return yield* decode(body).pipe(
            Effect.catch((error) =>
              fail('body', `${service}'s answer didn't decode: ${String(error)}`),
            ),
          )
        })
        return Effect.gen(function* () {
          const started = yield* Clock.currentTimeMillis
          const answer = yield* attempt.pipe(
            Effect.retry({ times: 1, while: retryable }),
            Effect.catch((error) =>
              Effect.flatMap(Clock.currentTimeMillis, (ended) =>
                Effect.fail<CallError>({ ...error, ms: ended - started }),
              ),
            ),
          )
          const ended = yield* Clock.currentTimeMillis
          return { answer, attempts, ms: ended - started }
        })
      }

      return {
        journeyPos: (query) =>
          call('journeyPos', JourneyPosAnswer, {
            llLat: query.box.south,
            llLon: query.box.west,
            urLat: query.box.north,
            urLon: query.box.east,
            products: query.products,
            positionMode: query.positionMode,
            maxJny: query.maxJny,
          }),
        // Which parameters narrow the messages to Copenhagen is a first-day fact; until then
        // the products alone.
        himsearch: (query) => call('himsearch', HimSearchAnswer, { products: query.products }),
      }
    }),
  )
