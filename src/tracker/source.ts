// Where the tracker's answers come from, picked by `MYLDER_SOURCE` at request time
// (docs/testing-seams.md, "The switch"): the simulated Rejseplanen, a recording, or the real API.
// The key never picks the source, so a missing key fails loudly instead of showing a simulation.
import 'server-only'
import { Effect, type Layer } from 'effect'
import { REFUSED_KEY } from './rejseplanen/answers.ts'
import * as Http from './rejseplanen/http.ts'
import * as SimulatedRejseplanen from './simulation/layer.ts'
import { DEFAULT_SCENARIO, scenarioNamed } from './simulation/scenarios.ts'
import type { Timetable } from './timetable.ts'

export type Source =
  | { readonly kind: 'simulated'; readonly scenario: string }
  | { readonly kind: 'recording'; readonly folder: string }
  | { readonly kind: 'rejseplanen' }

/** The variable that holds the Rejseplanen key. Production only, never `NEXT_PUBLIC_`. */
export const KEY_VARIABLE = 'REJSEPLANEN_KEY'

/**
 * Reads `MYLDER_SOURCE`: `simulated` or `simulated:<scenario>` (the default), `recording:<folder>`
 * or `rejseplanen`. Anything else is a mistake worth stopping for.
 */
export function readSource(value: string | undefined): Source {
  const setting = value?.trim() ?? ''
  if (setting === '' || setting === 'simulated') {
    return { kind: 'simulated', scenario: DEFAULT_SCENARIO }
  }
  if (setting === 'rejseplanen') return { kind: 'rejseplanen' }
  const [kind, ...rest] = setting.split(':')
  const argument = rest.join(':')
  if (kind === 'simulated' && argument) return { kind: 'simulated', scenario: argument }
  if (kind === 'recording' && argument) return { kind: 'recording', folder: argument }
  throw new Error(
    `MYLDER_SOURCE="${setting}" is none of simulated, simulated:<scenario>, recording:<folder> or rejseplanen`,
  )
}

/**
 * Rejseplanen with no key: every call logs the fault and answers as a refused key would, so the
 * snapshot's API health shows the mistake.
 */
const missingKey = Http.client((request) =>
  Effect.logError(`MYLDER_SOURCE=rejseplanen needs ${KEY_VARIABLE}; the call is refused`).pipe(
    Effect.as(Http.error(request, 401, REFUSED_KEY, `No ${KEY_VARIABLE} is set`)),
  ),
)

export interface SourceSettings {
  readonly source: Source
  /** The timetable the simulation builds its answers from. */
  readonly timetable: Timetable
  /** The Rejseplanen key, when one is set. */
  readonly key?: string
  readonly seed?: number
}

/** The `HttpClient` layer a source answers through. */
export function apiLayer(settings: SourceSettings): Layer.Layer<Http.HttpClient.HttpClient> {
  const { source } = settings
  switch (source.kind) {
    case 'simulated':
      return SimulatedRejseplanen.layer({
        timetable: settings.timetable,
        scenario: scenarioNamed(source.scenario),
        seed: settings.seed,
      })
    case 'recording':
      // The recorded layer arrives with the recordings (#53).
      throw new Error(`MYLDER_SOURCE=recording:${source.folder} isn't built yet`)
    case 'rejseplanen':
      return settings.key ? Http.fetchLayer : Http.layer(missingKey)
  }
}
