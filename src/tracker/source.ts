// Where the tracker's answers come from, picked by `MYLDER_SOURCE` at request time
// (docs/testing-seams.md, "The switch"): the timetable alone (the default, and production's until
// the key arrives, ADR 0018), the simulated Rejseplanen, a recording, or the real API. The key
// never picks the source, so a missing key fails loudly instead of showing a simulation.
import 'server-only'
import { Effect, type Layer } from 'effect'
import * as Http from './http.ts'
import { REFUSED_KEY } from './rejseplanen/answers.ts'
import { errorAnswer, RECORDED_REJSEPLANEN } from './rejseplanen/responses.ts'
import * as RecordedHttpClient from './recording/layer.ts'
import { recordingDir } from './recording/layer.ts'
import * as SimulatedRejseplanen from './simulation/layer.ts'
import { DEFAULT_SCENARIO, scenarioNamed } from './simulation/scenarios.ts'
import type { Snapshot } from './snapshot.ts'
import type { Timetable } from './timetable.ts'
import { UPDATES_VARIABLE, updatesSetting, type Updates } from './updates.ts'

/**
 * A source as the tracker runs it, with the scenario or recording it needs. What a rider is told
 * about each is `describeSource`'s (src/domain/source.ts); this module alone tells them apart, to
 * read the variable, build each one's API and name it in the snapshot.
 */
export type Source =
  /** The timetable alone: no call of any kind, every trip Timetable only. */
  | { readonly kind: 'timetable' }
  | { readonly kind: 'simulated'; readonly scenario: string }
  | { readonly kind: 'recording'; readonly folder: string }
  | { readonly kind: 'rejseplanen' }

/** The variable that holds the Rejseplanen key. Production only, never `NEXT_PUBLIC_`. */
export const KEY_VARIABLE = 'REJSEPLANEN_KEY'

/**
 * Reads `MYLDER_SOURCE`: `timetable` (the default, when it is unset or empty, so a deployment that
 * forgets it shows the honest map, never invented realtime), `simulated` or `simulated:<scenario>`,
 * `recording:<folder>` or `rejseplanen`. Anything else is a mistake worth stopping for.
 */
export function readSource(value: string | undefined): Source {
  const setting = value?.trim() ?? ''
  if (setting === '' || setting === 'timetable') return { kind: 'timetable' }
  if (setting === 'simulated') return { kind: 'simulated', scenario: DEFAULT_SCENARIO }
  if (setting === 'rejseplanen') return { kind: 'rejseplanen' }
  const [kind, ...rest] = setting.split(':')
  const argument = rest.join(':')
  if (kind === 'simulated' && argument) return { kind: 'simulated', scenario: argument }
  if (kind === 'recording' && argument) return { kind: 'recording', folder: argument }
  throw new Error(
    `MYLDER_SOURCE="${setting}" is none of timetable, simulated, simulated:<scenario>, recording:<folder> or rejseplanen`,
  )
}

/**
 * Rejseplanen with no key: every call logs the fault and answers as a refused key would, so the
 * snapshot's API health shows the mistake.
 */
const missingKey = Http.client((request) =>
  Effect.logError(`MYLDER_SOURCE=rejseplanen needs ${KEY_VARIABLE}; the call is refused`).pipe(
    Effect.as(errorAnswer(request, 401, REFUSED_KEY, `No ${KEY_VARIABLE} is set`)),
  ),
)

/**
 * The timetable source's API: none. Every request is a bug, so it logs an error naming the source
 * and dies, failing the request it came from rather than falling back to the timetable unseen.
 */
const refusing = Http.client((_request, url) => {
  const service = url.pathname.split('/').at(-1)
  const message = `MYLDER_SOURCE=timetable makes no calls, yet a call to ${service} reached its API; it is refused`
  return Effect.logError(message).pipe(Effect.andThen(Effect.die(new Error(message))))
})

/** A source as the snapshot names it: its kind, and the scenario or recording it runs. */
export function snapshotSourceOf(source: Source): Snapshot['source'] {
  switch (source.kind) {
    case 'simulated':
      return { kind: source.kind, name: source.scenario }
    case 'recording':
      return { kind: source.kind, name: source.folder }
    case 'timetable':
    case 'rejseplanen':
      return { kind: source.kind }
  }
}

/**
 * The saved folder in `recordings/` a source runs on, its timetable and its clock: a recording's
 * own, or the timetable source's from `from` (`MYLDER_TIMETABLE_FROM`), which no other source
 * reads, or else from the recording its updates replay (`MYLDER_UPDATES=recording:<folder>`), so
 * that recording's messages come at its own clock, on its own timetable.
 */
export function savedFolderOf(
  source: Source,
  from: string | undefined,
  updates?: Updates,
): string | undefined {
  switch (source.kind) {
    case 'recording':
      return source.folder
    case 'timetable':
      return from?.trim() || (updates?.kind === 'recording' ? updates.folder : undefined)
    case 'simulated':
    case 'rejseplanen':
      return undefined
  }
}

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
    case 'timetable':
      return Http.layer(refusing)
    case 'simulated':
      return SimulatedRejseplanen.layer({
        timetable: settings.timetable,
        scenario: scenarioNamed(source.scenario),
        seed: settings.seed,
      })
    case 'recording':
      return RecordedHttpClient.layer(RECORDED_REJSEPLANEN, recordingDir(source.folder))
    case 'rejseplanen':
      return settings.key ? Http.fetchLayer : Http.layer(missingKey)
  }
}

/**
 * The updates a source runs with (`MYLDER_UPDATES`, ./updates.ts). The simulated Rejseplanen
 * brings its own invented updates, so under it the switch is ignored, with a warning to log when it
 * was set.
 */
export function updatesFor(
  source: Source,
  updates: Updates,
): { readonly updates: Updates; readonly warning?: string } {
  if (source.kind !== 'simulated' || updates.kind === 'off') return { updates }
  return {
    updates: { kind: 'off' },
    warning: `${UPDATES_VARIABLE}=${updatesSetting(updates)} is ignored under MYLDER_SOURCE=simulated, which brings its own updates`,
  }
}
