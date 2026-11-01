// The tracker's one door to `effect/http`, Effect's `unstable` HTTP module (ADR 0011): every
// feed's adapter at the API seam, live, recorded or simulated, builds its client and its answers
// here, so a minor release can break only this file. It knows no feed.
import 'server-only'
import { Effect, Layer, Stream } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientResponse } from 'effect/http'
import type { HttpClientRequest } from 'effect/http'

export { HttpClient }

export type Request = HttpClientRequest.HttpClientRequest
export type Response = HttpClientResponse.HttpClientResponse

/** Headers an answer carries beside its content type, such as a 429's `Retry-After`. */
type ExtraHeaders = Readonly<Record<string, string>>

/** Answers a request with a JSON body. */
export const json = (
  request: Request,
  status: number,
  body: unknown,
  headers: ExtraHeaders = {},
): Response =>
  HttpClientResponse.fromWeb(
    request,
    new globalThis.Response(JSON.stringify(body), {
      status,
      headers: { ...headers, 'content-type': 'application/json;charset=UTF-8' },
    }),
  )

/** Answers a request with a plain body, as a server in front of an API might fail. */
export const text = (
  request: Request,
  status: number,
  body: string,
  headers: ExtraHeaders = {},
): Response =>
  HttpClientResponse.fromWeb(
    request,
    new globalThis.Response(body, {
      status,
      headers: { ...headers, 'content-type': 'text/plain' },
    }),
  )

/** How long a timed-out call hangs before the gateway gives up, past any client's timeout. */
const TIMEOUT_AFTER = '30 seconds'

/** Hangs as a call that never answers does, then answers as the gateway in front would. */
export const gatewayTimeout = (request: Request): Effect.Effect<Response> =>
  Effect.sleep(TIMEOUT_AFTER).pipe(Effect.as(text(request, 504, 'Gateway Timeout')))

/** Fails a request as a network that can't reach its host does. */
export const unreachable = (
  request: Request,
): Effect.Effect<never, HttpClientError.HttpClientError> =>
  Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({ request, description: 'unreachable' }),
    }),
  )

/** An `HttpClient` that answers every request itself, from the request and its URL. */
export const client = (
  answer: (request: Request, url: URL) => Effect.Effect<Response, HttpClientError.HttpClientError>,
): HttpClient.HttpClient => HttpClient.make((request, url) => answer(request, url))

/** The layer that provides a client as the tracker's `HttpClient`. */
export const layer = (provided: HttpClient.HttpClient): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(HttpClient.HttpClient, provided)

/** The real network, for the real APIs. */
export const fetchLayer: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer

/** A request that failed before an answer came back, and whether the network was to blame. */
export interface Unanswered {
  readonly network: boolean
  readonly message: string
}

/** An answer as `getText` gives it: its status, its headers by lowercase name, and its body. */
export interface Answer {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly text: string
}

/** GETs a URL with a query through a client, answering with the status, headers and body. */
export const getText = (
  httpClient: HttpClient.HttpClient,
  url: string,
  urlParams: Readonly<Record<string, string | number>>,
): Effect.Effect<Answer, Unanswered> =>
  httpClient.get(url, { urlParams }).pipe(
    Effect.flatMap((response) =>
      Effect.map(response.text, (body) => ({
        status: response.status,
        headers: response.headers,
        text: body,
      })),
    ),
    Effect.mapError((failure) => ({
      network: failure.reason instanceof HttpClientError.TransportError,
      message: failure.message,
    })),
  )

/** A body cut off at its limit: none of it is kept. */
class OverLimit {
  readonly _tag = 'OverLimit'
}

/**
 * GETs a URL with headers, reading at most `maxBytes` of its body: an answer longer than that is
 * given as `tooLarge`, with no text, and the rest of it is never read.
 */
export const getTextUpTo = (
  httpClient: HttpClient.HttpClient,
  url: string,
  maxBytes: number,
  headers: ExtraHeaders = {},
): Effect.Effect<Answer & { readonly tooLarge?: true }, Unanswered> =>
  httpClient.get(url, { headers }).pipe(
    Effect.flatMap((response) => {
      const chunks: Uint8Array[] = []
      let size = 0
      const answer = (body: string) => ({
        status: response.status,
        headers: response.headers,
        text: body,
      })
      return Stream.runForEach(response.stream, (chunk) => {
        size += chunk.byteLength
        if (size > maxBytes) return Effect.fail(new OverLimit())
        chunks.push(chunk)
        return Effect.void
      }).pipe(
        Effect.map(() => answer(decodeAll(chunks, size))),
        Effect.catchTag('OverLimit', () =>
          Effect.succeed({ ...answer(''), tooLarge: true as const }),
        ),
      )
    }),
    Effect.mapError((failure) => ({
      network: failure.reason instanceof HttpClientError.TransportError,
      message: failure.message,
    })),
  )

/** Chunks of UTF-8, `size` bytes in all, as one string. */
function decodeAll(chunks: readonly Uint8Array[], size: number): string {
  const all = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    all.set(chunk, at)
    at += chunk.byteLength
  }
  return new TextDecoder().decode(all)
}
