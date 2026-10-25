// The simulated Rejseplanen as an `HttpClient` layer: the third adapter at the API seam, beside
// the live client and the recordings (docs/testing-seams.md). For each request it reads the
// service from the URL's path and the parameters from its query, builds the answer from the
// world at the runtime's clock, and encodes it with the service's schema.
import 'server-only'
import { Clock, Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientResponse, type HttpClientRequest } from 'effect/http'
import { ErrorAnswer, JourneyPosAnswer, SERVICES, type Service } from '../rejseplanen/answers.ts'
import type { Timetable } from '../timetable.ts'
import { journeyPos, readJourneyPosRequest } from './journey-pos.ts'
import { DEFAULT_SCENARIO, SCENARIOS, type Scenario } from './scenarios.ts'
import { worldAt, type SimulationSettings } from './world.ts'

/** The seed a simulation runs on when none is given. */
export const DEFAULT_SEED = 1

export interface SimulationOptions {
  readonly timetable: Timetable
  readonly scenario?: Scenario
  readonly seed?: number
}

/** The scenario of a name, or an error naming the ones there are. */
export function scenarioNamed(name: string = DEFAULT_SCENARIO): Scenario {
  const scenario = SCENARIOS[name]
  if (!scenario) {
    throw new Error(
      `No simulated scenario "${name}"; there are ${Object.keys(SCENARIOS).join(', ')}`,
    )
  }
  return scenario
}

/** The service a request calls, from the last segment of its path, in any case. */
function serviceOf(url: URL): Service | undefined {
  const last = url.pathname.split('/').at(-1)?.toLowerCase()
  return SERVICES.find((service) => service.toLowerCase() === last)
}

const json = (request: HttpClientRequest.HttpClientRequest, status: number, body: unknown) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
    }),
  )

/** An answer to a service the simulation doesn't give yet, or doesn't know. */
const unsupported = (request: HttpClientRequest.HttpClientRequest, path: string) =>
  json(
    request,
    400,
    Schema.encodeSync(ErrorAnswer)({
      errorCode: 'SVC_PARAM',
      errorText: `The simulation doesn't answer ${path}`,
    }),
  )

/** The simulated Rejseplanen as an `HttpClient`. */
export function simulatedClient(options: SimulationOptions): HttpClient.HttpClient {
  const settings: SimulationSettings = {
    timetable: options.timetable,
    scenario: options.scenario ?? scenarioNamed(),
    seed: options.seed ?? DEFAULT_SEED,
  }
  const encodeJourneyPos = Schema.encodeSync(JourneyPosAnswer)
  return HttpClient.make((request, url) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      switch (serviceOf(url)) {
        case 'journeyPos': {
          const answer = journeyPos(
            settings,
            worldAt(settings, now),
            readJourneyPosRequest(url.searchParams),
          )
          return json(request, 200, encodeJourneyPos(answer))
        }
        default:
          return unsupported(request, url.pathname)
      }
    }),
  )
}

/** The simulated Rejseplanen, as the layer that provides the tracker's `HttpClient`. */
export const layer = (options: SimulationOptions): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(HttpClient.HttpClient, simulatedClient(options))
