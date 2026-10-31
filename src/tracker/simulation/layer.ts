// The simulated Rejseplanen as an `HttpClient` layer: the third adapter at the API seam, beside
// the live client and the recordings (docs/testing-seams.md). For each request it reads the
// service from the URL's path and the parameters from its query, builds the answer from the
// world at the runtime's clock, and encodes it with the service's schema; or, in a minute the
// scenario schedules a failure, fails as Rejseplanen might.
import 'server-only'
import { Clock, Effect, type Layer, Schema } from 'effect'
import * as Http from '../http.ts'
import {
  ArrivalBoardAnswer,
  DepartureBoardAnswer,
  HimSearchAnswer,
  JourneyDetailAnswer,
  JourneyPosAnswer,
  QUOTA_SPENT,
  REFUSED_KEY,
  serviceOf,
} from '../rejseplanen/answers.ts'
import { errorAnswer, svcParam } from '../rejseplanen/responses.ts'
import type { Timetable } from '../timetable.ts'
import { arrivalBoard, departureBoard, readDepartureBoardRequest } from './departures.ts'
import { journeyPos, readJourneyPosRequest } from './journey-pos.ts'
import { envelope } from './journeys.ts'
import { messagesAt } from './messages.ts'
import { scenarioNamed, type FailureKind, type Scenario } from './scenarios.ts'
import { journeyDetail } from './trip-detail.ts'
import { worldAt, type SimulationSettings } from './world.ts'

/** The seed a simulation runs on when none is given. */
export const DEFAULT_SEED = 1

export interface SimulationOptions {
  readonly timetable: Timetable
  readonly scenario?: Scenario
  readonly seed?: number
}

/** The failure the scenario schedules for a moment's minute of the hour, if any. */
function failureAt(scenario: Scenario, now: number): FailureKind | undefined {
  const minute = new Date(now).getUTCMinutes()
  return scenario.failures.find(({ from, to }) => minute >= from && minute < to)?.kind
}

/**
 * A scheduled failure's answer. Rejseplanen's own error shapes are guesses until the first real
 * ones (`answers.ts`).
 */
function failure(request: Http.Request, kind: Exclude<FailureKind, 'empty'>) {
  switch (kind) {
    case 'unavailable':
      return Effect.succeed(Http.text(request, 503, 'Service Unavailable'))
    case 'timeout':
      return Http.gatewayTimeout(request)
    case 'refused-key':
      return Effect.succeed(errorAnswer(request, 401, REFUSED_KEY, 'access denied for accessId'))
    case 'quota':
      return Effect.succeed(errorAnswer(request, 403, QUOTA_SPENT, 'quota exceeded'))
  }
}

/** The simulated Rejseplanen as an `HttpClient`. */
export function simulatedClient(options: SimulationOptions): Http.HttpClient.HttpClient {
  const settings: SimulationSettings = {
    timetable: options.timetable,
    scenario: options.scenario ?? scenarioNamed(),
    seed: options.seed ?? DEFAULT_SEED,
  }
  const { timezone } = settings.timetable.manifest
  const encode = {
    journeyPos: Schema.encodeSync(JourneyPosAnswer),
    multiDepartureBoard: Schema.encodeSync(DepartureBoardAnswer),
    multiArrivalBoard: Schema.encodeSync(ArrivalBoardAnswer),
    journeyDetail: Schema.encodeSync(JourneyDetailAnswer),
    himsearch: Schema.encodeSync(HimSearchAnswer),
  }
  return Http.client((request, url) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const service = serviceOf(url)
      const query = url.searchParams
      const failing = failureAt(settings.scenario, now)
      if (failing && failing !== 'empty') return yield* failure(request, failing)
      // An empty answer, the one docs/live-data.md watches for, has no list at all.
      const empty = failing === 'empty'
      switch (service) {
        case 'journeyPos': {
          const answer = empty
            ? envelope(now, timezone)
            : journeyPos(settings, worldAt(settings, now), readJourneyPosRequest(query))
          return Http.json(request, 200, encode.journeyPos(answer))
        }
        case 'multiDepartureBoard': {
          const answer = empty
            ? envelope(now, timezone)
            : departureBoard(settings, readDepartureBoardRequest(settings, query, now), now)
          return Http.json(request, 200, encode.multiDepartureBoard(answer))
        }
        case 'multiArrivalBoard': {
          const answer = empty
            ? envelope(now, timezone)
            : arrivalBoard(settings, readDepartureBoardRequest(settings, query, now), now)
          return Http.json(request, 200, encode.multiArrivalBoard(answer))
        }
        case 'journeyDetail': {
          const detail = journeyDetail(settings, query.get('id') ?? '', now)
          return detail
            ? Http.json(request, 200, encode.journeyDetail(detail))
            : svcParam(request, 'Unknown journey reference')
        }
        case 'himsearch': {
          const messages = empty ? [] : messagesAt(settings, now)
          const answer =
            messages.length > 0
              ? { Message: messages, ...envelope(now, timezone) }
              : envelope(now, timezone)
          return Http.json(request, 200, encode.himsearch(answer))
        }
        default:
          return svcParam(request, `Rejseplanen has no service ${url.pathname}`)
      }
    }),
  )
}

/** The simulated Rejseplanen, as the layer that provides the tracker's `HttpClient`. */
export const layer = (options: SimulationOptions): Layer.Layer<Http.HttpClient.HttpClient> =>
  Http.layer(simulatedClient(options))
