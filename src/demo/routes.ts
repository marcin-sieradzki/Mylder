// The demo's routes (ADR 0013): the server's tracker on the simulated Rejseplanen, built from the
// timetable files the demo serves, and the aircraft source on a recording bundled with the demo,
// answering each route the page asks for by its path with the server's own answers: the same
// bodies, date header, 404s and 503s.
import { Effect, Layer } from 'effect'
import type { Aircraft } from '../tracker/aircraft/aircraft.ts'
import { aircraftAnswers } from '../tracker/aircraft/routes.ts'
import { aircraftLayer, runAircraftOn } from '../tracker/aircraft/runtime.ts'
import { RECORDED_AIRCRAFT } from '../tracker/aircraft/source.ts'
import { notFound } from '../tracker/cdn-answer.ts'
import * as RecordedHttpClient from '../tracker/recording/layer.ts'
import type { RecordingFiles } from '../tracker/recording/layer.ts'
import { remember, rememberRuntime } from '../tracker/remember.ts'
import { CpuClock } from '../tracker/report.ts'
import { browserFileResponse, manifestResponse, trackerAnswers } from '../tracker/routes.ts'
import { runOn, trackerLayer } from '../tracker/runtime.ts'
import { DEFAULT_SCENARIO } from '../tracker/simulation/scenarios.ts'
import { readTimetable, type ReadTimetableFile } from '../tracker/timetable.ts'

export type { ReadTimetableFile }

/**
 * The recording whose aircraft answers the demo replays: its folder, and how its files are read.
 */
export interface DemoRecording {
  readonly dir: string
  /** From disk unless given; the worker's are bundled with it. */
  readonly files?: RecordingFiles
}

export interface DemoSettings {
  readonly read: ReadTimetableFile
  readonly aircraft: DemoRecording
  /**
   * Layers beneath the tracker and the aircraft, such as a clock that starts at a recording's
   * moment.
   */
  readonly beneath?: Layer.Layer<never>
}

/**
 * The demo's aircraft source: the recording's aircraft answers in call order, one a call, as the
 * server replays them, but starting again from the first once they run out, so the planes never
 * stop. Each answer's aircraft carry the ages they had when it was recorded, counted from the
 * snapshot's fetch on the demo's clock, so every pass is as fresh as the first (docs/aircraft.md).
 */
export const demoAircraftLayer = ({ dir, files }: DemoRecording): Layer.Layer<Aircraft> =>
  aircraftLayer({
    source: { kind: 'recording', folder: 'demo' },
    http: RecordedHttpClient.layer(RECORDED_AIRCRAFT, dir, { files, whenDone: 'loop' }),
  })

// The worker does nothing but run the tracker, so its time passing stands in for CPU time.
const workerCpu = Layer.succeed(
  CpuClock,
  Effect.sync(() => performance.now()),
)

/** A path's segments after the first slash, or none when one isn't a valid escape. */
function segmentsOf(path: string): string[] | undefined {
  try {
    return new URL(path, 'http://mylder').pathname.split('/').slice(1).map(decodeURIComponent)
  } catch {
    return undefined
  }
}

/** The demo's routes, answering a path such as `/api/snapshot` or `/api/stops/<id>`. */
export function demoRoutes({ read: readFolder, aircraft, beneath = Layer.empty }: DemoSettings) {
  // The manifest is read once, so the tracker and the network's files hold the same version for
  // the page's life, as the deployment it opened on; a read that fails is tried again.
  const manifest = remember(() => readFolder('manifest.json'))
  const read: ReadTimetableFile = (file) =>
    file === 'manifest.json' ? manifest() : readFolder(file)

  // The tracker's runtime, built at the first ask for it; a build that fails, such as on a
  // dropped connection, is forgotten, so the next ask tries again, as the server's runtime does.
  const runtime = rememberRuntime(async () => {
    const timetable = await readTimetable(read)
    const source = { kind: 'simulated', scenario: DEFAULT_SCENARIO } as const
    return trackerLayer({ timetable, source, cpu: workerCpu }).pipe(Layer.provideMerge(beneath))
  })

  const answers = trackerAnswers(runOn(runtime))

  // The aircraft's runtime, apart from the tracker's, as on the server: a timetable that can't be
  // read never stops the planes, and a recording that can't be is read again on the next ask.
  const planes = aircraftAnswers(
    runAircraftOn(
      rememberRuntime(async () => demoAircraftLayer(aircraft).pipe(Layer.provideMerge(beneath))),
    ),
  )

  return async function route(path: string): Promise<Response> {
    const [api, name, ...rest] = segmentsOf(path) ?? []
    if (api !== 'api') return notFound('route')
    if (name === 'snapshot' && rest.length === 0) return answers.snapshot()
    if (name === 'disruptions' && rest.length === 0) return answers.disruptions()
    if (name === 'stops' && rest.length === 1) return answers.stop(rest[0])
    if (name === 'trips' && rest.length === 1) return answers.trip(rest[0])
    if (name === 'aircraft' && rest.length === 0) return planes.snapshot()
    // The network's files come straight from the folder, so the map draws its lines without
    // waiting for the tracker's timetable.
    if (name === 'timetable' && rest.length === 0) return manifestResponse(read)
    if (name === 'timetable' && rest.length === 2)
      return browserFileResponse(read, rest[0], rest[1])
    return notFound('route')
  }
}
