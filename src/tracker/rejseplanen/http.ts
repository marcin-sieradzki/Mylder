// The tracker's one door to `effect/http`, Effect's `unstable` HTTP module (ADR 0011): every
// adapter at the API seam, live, recorded or simulated, builds its client and its answers here,
// so a minor release can break only this file.
import 'server-only'
import { Effect, Layer, Schema } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http'
import type { HttpClientError, HttpClientRequest } from 'effect/http'
import { ErrorAnswer } from './answers.ts'

export { HttpClient }

export type Request = HttpClientRequest.HttpClientRequest
export type Response = HttpClientResponse.HttpClientResponse

/** Answers a request with a JSON body, as Rejseplanen does. */
export const json = (request: Request, status: number, body: unknown): Response =>
  HttpClientResponse.fromWeb(
    request,
    new globalThis.Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
    }),
  )

/** Answers a request with Rejseplanen's error answer. */
export const error = (request: Request, status: number, errorCode: string, errorText: string) =>
  json(request, status, Schema.encodeSync(ErrorAnswer)({ errorCode, errorText }))

/** An `HttpClient` that answers every request itself, from the request and its URL. */
export const client = (
  answer: (request: Request, url: URL) => Effect.Effect<Response, HttpClientError.HttpClientError>,
): HttpClient.HttpClient => HttpClient.make((request, url) => answer(request, url))

/** The layer that provides a client as the tracker's `HttpClient`. */
export const layer = (provided: HttpClient.HttpClient): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(HttpClient.HttpClient, provided)

/** The real network, for the real Rejseplanen. */
export const fetchLayer: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer
