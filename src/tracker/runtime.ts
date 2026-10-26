// The tracker's runtime: its layers composed once per instance, from the settings read at the
// first request (docs/testing-seams.md, "The switch"), so one build serves every source.
import 'server-only'
import { Effect, Layer, Logger, ManagedRuntime, Schema } from 'effect'
import { join } from 'node:path'
import { startingAt } from './recording/clock.ts'
import { readStart, recordingDir } from './recording/layer.ts'
import { CpuClock, processCpu } from './report.ts'
import { PositionMode as PositionModeSchema } from './snapshot.ts'
import * as Rejseplanen from './rejseplanen/client.ts'
import type * as Http from './http.ts'
import { apiLayer, KEY_VARIABLE, readSource, type Source } from './source.ts'
import { memoryLayer, type Store } from './store.ts'
import { loadTimetable, TIMETABLE_DIR, type Timetable } from './timetable.ts'
import {
  clientSettings,
  describeSource,
  layer as trackerServiceLayer,
  TimetableService,
  Tracker,
  type TrackerShape,
  TrackerConfig,
  type PositionMode,
  type TrackerSettings,
} from './tracker.ts'

/** The variable that picks the position mode; alternating until the first day with the key (#35). */
export const POSITION_MODE_VARIABLE = 'MYLDER_POSITION_MODE'

export const DEFAULT_POSITION_MODE: PositionMode = 'alternating'

const isPositionMode = Schema.is(PositionModeSchema)

export function readPositionMode(value: string | undefined): PositionMode {
  const setting = value?.trim() || DEFAULT_POSITION_MODE
  if (isPositionMode(setting)) return setting
  throw new Error(
    `${POSITION_MODE_VARIABLE}="${setting}" is none of ${PositionModeSchema.literals.join(', ')}`,
  )
}

/** Each source keeps its own state, so a simulated call never touches a live counter. */
export function keyPrefixOf(source: Source): string {
  const { kind, name } = describeSource(source)
  return name ? `mylder:${kind}:${name}` : `mylder:${kind}`
}

export interface TrackerLayerOptions {
  readonly timetable: Timetable
  readonly source: Source
  readonly positionMode?: PositionMode
  /** The `HttpClient` the API answers through; the source's own when left out. */
  readonly http?: Layer.Layer<Http.HttpClient.HttpClient>
  readonly key?: string
  /** The CPU clock runs measure themselves by; the process's own when left out. */
  readonly cpu?: Layer.Layer<CpuClock>
}

/** The tracker with all it needs: the store in memory, the timetable, the source's client. */
export function trackerLayer(options: TrackerLayerOptions): Layer.Layer<Tracker | Store> {
  const settings: TrackerSettings = {
    source: options.source,
    positionMode: options.positionMode ?? DEFAULT_POSITION_MODE,
    keyPrefix: keyPrefixOf(options.source),
  }
  const http =
    options.http ??
    apiLayer({ source: options.source, timetable: options.timetable, key: options.key })
  const client = Rejseplanen.layer(clientSettings(settings, options.timetable, options.key)).pipe(
    Layer.provide(http),
  )
  const base = Layer.mergeAll(
    memoryLayer,
    Layer.succeed(TimetableService, options.timetable),
    Layer.succeed(TrackerConfig, settings),
    options.cpu ?? processCpu,
  )
  return trackerServiceLayer.pipe(Layer.provide(client), Layer.provideMerge(base))
}

/** Where a source's timetable lives: a recording brings its own, the rest use the deployed one. */
export function timetableDirOf(source: Source): string {
  return source.kind === 'recording'
    ? join(recordingDir(source.folder), 'timetable')
    : TIMETABLE_DIR
}

/**
 * The tracker as the environment sets it up. A recording brings its own timetable and its clock,
 * which starts at the recording's moment (docs/testing-seams.md, "The switch").
 */
async function environmentLayer(): Promise<Layer.Layer<Tracker | Store>> {
  const source = readSource(process.env.MYLDER_SOURCE)
  const positionMode = readPositionMode(process.env[POSITION_MODE_VARIABLE])
  if (source.kind === 'recording') {
    const dir = recordingDir(source.folder)
    const [timetable, start] = await Promise.all([
      loadTimetable(timetableDirOf(source)),
      readStart(dir),
    ])
    // Provided beneath the tracker, so whatever it starts while it is built runs on recorded time.
    return trackerLayer({ timetable, source, positionMode }).pipe(
      Layer.provideMerge(startingAt(start)),
    )
  }
  const timetable = await loadTimetable(timetableDirOf(source))
  return trackerLayer({ timetable, source, positionMode, key: process.env[KEY_VARIABLE] })
}

let runtime: Promise<ManagedRuntime.ManagedRuntime<Tracker | Store, never>> | undefined

/**
 * This instance's runtime, built once at the first request from the environment, which is read
 * then rather than at build time (docs/testing-seams.md, "The switch"). A failed build, such as a
 * timetable that can't be read, is forgotten, so the next request tries again.
 */
export function trackerRuntime(): Promise<ManagedRuntime.ManagedRuntime<Tracker | Store, never>> {
  if (runtime) return runtime
  // One JSON line per log, which the host's log search reads field by field.
  runtime = environmentLayer().then((layer) =>
    ManagedRuntime.make(layer.pipe(Layer.provideMerge(Logger.layer([Logger.consoleJson])))),
  )
  runtime.catch(() => {
    runtime = undefined
  })
  return runtime
}

/** Runs one use of the tracker, as a plain promise. */
export type RunTracker = <A>(use: (tracker: TrackerShape) => Effect.Effect<A>) => Promise<A>

/** Runs one use of the tracker on the runtime `built` gives, once it is built. */
export const runOn =
  (built: () => Promise<ManagedRuntime.ManagedRuntime<Tracker | Store, never>>): RunTracker =>
  async (use) =>
    (await built()).runPromise(
      Effect.gen(function* () {
        return yield* use(yield* Tracker)
      }),
    )

/** Runs one use of the tracker on this instance's runtime, as a plain promise. */
export const runTracker: RunTracker = runOn(trackerRuntime)
