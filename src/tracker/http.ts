// The tracker's one door to `effect/http`, Effect's `unstable` HTTP module (ADR 0011): every
// feed's adapter at the API seam, live, recorded or simulated, builds its client and its answers
// here, so a minor release can break only this file. It knows no feed.
import 'server-only'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientResponse } from 'effect/http'
import type { HttpClientRequest } from 'effect/http'

export { HttpClient }

export type Request = HttpClientRequest.HttpClientRequest
export type Response = HttpClientResponse.HttpClientResponse

/** Answers a request with a JSON body. */
export const json = (request: Request, status: number, body: unknown): Response =>
  HttpClientResponse.fromWeb(
    request,
    new globalThis.Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
    }),
  )

/** Answers a request with a plain body, as a server in front of an API might fail. */
export const text = (request: Request, status: number, body: string): Response =>
  HttpClientResponse.fromWeb(
    request,
    new globalThis.Response(body, { status, headers: { 'content-type': 'text/plain' } }),
  )

/** How long a timed-out call hangs before the gateway gives up, past any client's timeout. */
const TIMEOUT_AFTER = '30 seconds'

/** Hangs as a call that never answers does, then answers as the gateway in front would. */
export const gatewayTimeout = (request: Request): Effect.Effect<Response> =>
  Effect.sleep(TIMEOUT_AFTER).pipe(Effect.as(text(request, 504, 'Gateway Timeout')))

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

/** GETs a URL with a query through a client, answering with the status and the body's text. */
export const getText = (
  httpClient: HttpClient.HttpClient,
  url: string,
  urlParams: Readonly<Record<string, string | number>>,
): Effect.Effect<{ readonly status: number; readonly text: string }, Unanswered> =>
  httpClient.get(url, { urlParams }).pipe(
    Effect.flatMap((response) =>
      Effect.map(response.text, (body) => ({ status: response.status, text: body })),
    ),
    Effect.mapError((failure) => ({
      network: failure.reason instanceof HttpClientError.TransportError,
      message: failure.message,
    })),
  )
