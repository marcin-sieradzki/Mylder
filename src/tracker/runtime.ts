// The tracker's runtime: its layers composed once per instance, from the settings read at the
// first request (docs/testing-seams.md, "The switch"), so one build serves every source.
import 'server-only'
import { Effect, Layer, Logger, type ManagedRuntime, Schema } from 'effect'
import { join } from 'node:path'
import { sharedStartingAt } from './recording/clock.ts'
import { readStart, recordingDir } from './recording/layer.ts'
import { rememberRuntime } from './remember.ts'
import { CpuClock, processCpu } from './report.ts'
import { PositionMode as PositionModeSchema } from './snapshot.ts'
import * as Rejseplanen from './rejseplanen/client.ts'
import type * as Http from './http.ts'
import {
  apiLayer,
  KEY_VARIABLE,
  readSource,
  savedFolderOf,
  snapshotSourceOf,
  type Source,
} from './source.ts'
import { memoryLayer, type Store } from './store.ts'
import { loadTimetable, TIMETABLE_DIR, type Timetable } from './timetable.ts'
import {
  clientSettings,
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
  const { kind, name } = snapshotSourceOf(source)
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

/**
 * The variable that runs the timetable source on a saved folder in `recordings/`, its timetable
 * and its clock, so the verifier can drive a moment such as a timetable's last week again. Only
 * the timetable source reads it; production never sets it.
 */
export const TIMETABLE_FROM_VARIABLE = 'MYLDER_TIMETABLE_FROM'

/**
 * Where a source's timetable lives: a recording brings its own, as does the timetable source
 * run on a saved folder (`from`, `MYLDER_TIMETABLE_FROM`); the rest use the deployed one.
 */
export function timetableDirOf(source: Source, from?: string): string {
  const folder = savedFolderOf(source, from)
  return folder ? join(recordingDir(folder), 'timetable') : TIMETABLE_DIR
}

type Environment = Readonly<Record<string, string | undefined>>

/**
 * The tracker as the environment sets it up. A recording brings its own timetable and its clock,
 * which starts at the recording's moment, as the aircraft's does, and so does the timetable source
 * run on a saved folder (docs/testing-seams.md, "The switch").
 */
export async function environmentLayer(
  env: Environment = process.env,
): Promise<Layer.Layer<Tracker | Store>> {
  const source = readSource(env.MYLDER_SOURCE)
  const positionMode = readPositionMode(env[POSITION_MODE_VARIABLE])
  const folder = savedFolderOf(source, env[TIMETABLE_FROM_VARIABLE])
  if (folder) {
    const [timetable, start] = await Promise.all([
      loadTimetable(join(recordingDir(folder), 'timetable')),
      readStart(recordingDir(folder)),
    ])
    // Provided beneath the tracker, so whatever it starts while it is built runs on recorded time.
    return trackerLayer({ timetable, source, positionMode }).pipe(
      Layer.provideMerge(sharedStartingAt(start)),
    )
  }
  const timetable = await loadTimetable(TIMETABLE_DIR)
  return trackerLayer({ timetable, source, positionMode, key: env[KEY_VARIABLE] })
}

/**
 * This instance's runtime, built once at the first request from the environment, which is read
 * then rather than at build time (docs/testing-seams.md, "The switch"). A failed build, such as a
 * timetable that can't be read, is forgotten, so the next request tries again.
 */
export const trackerRuntime: () => Promise<ManagedRuntime.ManagedRuntime<Tracker | Store, never>> =
  rememberRuntime(() =>
    // One JSON line per log, which the host's log search reads field by field.
    environmentLayer().then((layer) =>
      layer.pipe(Layer.provideMerge(Logger.layer([Logger.consoleJson]))),
    ),
  )

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
