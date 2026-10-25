// The simulated Rejseplanen as an `HttpClient` layer: the third adapter at the API seam, beside
// the live client and the recordings (docs/testing-seams.md). For each request it reads the
// service from the URL's path and the parameters from its query, builds the answer from the
// world at the runtime's clock, and encodes it with the service's schema.
import 'server-only'
import { Clock, Effect, type Layer, Schema } from 'effect'
import { JourneyPosAnswer, SERVICES, type Service } from '../rejseplanen/answers.ts'
import * as Http from '../rejseplanen/http.ts'
import type { Timetable } from '../timetable.ts'
import { journeyPos, readJourneyPosRequest } from './journey-pos.ts'
import { scenarioNamed, type Scenario } from './scenarios.ts'
import { worldAt, type SimulationSettings } from './world.ts'

/** The seed a simulation runs on when none is given. */
export const DEFAULT_SEED = 1

export interface SimulationOptions {
  readonly timetable: Timetable
  readonly scenario?: Scenario
  readonly seed?: number
}

/** The service a request calls, from the last segment of its path, in any case. */
function serviceOf(url: URL): Service | undefined {
  const last = url.pathname.split('/').at(-1)?.toLowerCase()
  return SERVICES.find((service) => service.toLowerCase() === last)
}

/** The simulated Rejseplanen as an `HttpClient`. */
export function simulatedClient(options: SimulationOptions): Http.HttpClient.HttpClient {
  const settings: SimulationSettings = {
    timetable: options.timetable,
    scenario: options.scenario ?? scenarioNamed(),
    seed: options.seed ?? DEFAULT_SEED,
  }
  const encodeJourneyPos = Schema.encodeSync(JourneyPosAnswer)
  return Http.client((request, url) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      switch (serviceOf(url)) {
        case 'journeyPos': {
          const answer = journeyPos(
            settings,
            worldAt(settings, now),
            readJourneyPosRequest(url.searchParams),
          )
          return Http.json(request, 200, encodeJourneyPos(answer))
        }
        default:
          // A service the simulation doesn't answer yet, or one Rejseplanen doesn't have.
          return Http.error(
            request,
            400,
            'SVC_PARAM',
            `The simulation doesn't answer ${url.pathname}`,
          )
      }
    }),
  )
}

/** The simulated Rejseplanen, as the layer that provides the tracker's `HttpClient`. */
export const layer = (options: SimulationOptions): Layer.Layer<Http.HttpClient.HttpClient> =>
  Http.layer(simulatedClient(options))
