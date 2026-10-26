// The aircraft source's runtime: its layers composed once per instance from
// `MYLDER_AIRCRAFT_SOURCE`, read at the first request, apart from the tracker's runtime, so a
// timetable that can't be read never stops the aircraft answering (docs/aircraft.md).
import 'server-only'
import { Effect, Layer, Logger, type ManagedRuntime } from 'effect'
import type * as Http from '../http.ts'
import { sharedStartingAt } from '../recording/clock.ts'
import { readStart, recordingDir } from '../recording/layer.ts'
import { rememberRuntime } from '../remember.ts'
import {
  Aircraft,
  AircraftConfig,
  layer as aircraftServiceLayer,
  offLayer,
  type AircraftShape,
} from './aircraft.ts'
import {
  AIRCRAFT_SOURCE_VARIABLE,
  feedLayer,
  feedsOf,
  readAircraftSource,
  type AircraftSource,
} from './source.ts'

export interface AircraftLayerOptions {
  readonly source: AircraftSource
  /** The `HttpClient` the feed answers through; the source's own when left out. */
  readonly http?: Layer.Layer<Http.HttpClient.HttpClient>
}

/** The aircraft source with all it needs: the feed's client, or nothing when it is off. */
export function aircraftLayer({ source, http }: AircraftLayerOptions): Layer.Layer<Aircraft> {
  if (source.kind === 'off') return offLayer
  const config = Layer.succeed(AircraftConfig, feedsOf(source))
  return aircraftServiceLayer.pipe(Layer.provide(http ?? feedLayer(source)), Layer.provide(config))
}

/**
 * The aircraft source as the environment sets it up. Under a recording its clock starts at the
 * recording's moment, the same as the tracker's (docs/testing-seams.md, "Time").
 */
async function environmentLayer(): Promise<Layer.Layer<Aircraft>> {
  const source = readAircraftSource(process.env[AIRCRAFT_SOURCE_VARIABLE])
  if (source.kind !== 'recording') return aircraftLayer({ source })
  const start = await readStart(recordingDir(source.folder))
  return aircraftLayer({ source }).pipe(Layer.provideMerge(sharedStartingAt(start)))
}

/**
 * This instance's runtime, built once at the first request; a failed build, such as a recording
 * that can't be read, is forgotten, so the next request tries again.
 */
export const aircraftRuntime: () => Promise<ManagedRuntime.ManagedRuntime<Aircraft, never>> =
  rememberRuntime(() =>
    environmentLayer().then((layer) =>
      layer.pipe(Layer.provideMerge(Logger.layer([Logger.consoleJson]))),
    ),
  )

/** Runs one use of the aircraft source, as a plain promise. */
export type RunAircraft = <A>(use: (aircraft: AircraftShape) => Effect.Effect<A>) => Promise<A>

/** Runs one use of the aircraft source on the runtime `built` gives, as a plain promise. */
export const runAircraftOn =
  (built: () => Promise<ManagedRuntime.ManagedRuntime<Aircraft, never>>): RunAircraft =>
  async (use) =>
    (await built()).runPromise(
      Effect.gen(function* () {
        return yield* use(yield* Aircraft)
      }),
    )

/** Runs one use of the aircraft source on this instance's runtime, as a plain promise. */
export const runAircraft: RunAircraft = runAircraftOn(aircraftRuntime)
