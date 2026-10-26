// The demo's routes (ADR 0013): the server's tracker on the simulated Rejseplanen, built from the
// timetable files the demo serves, answering each route the page asks for by its path with the
// server's own answers: the same bodies, date header, 404s and 503s.
import { Effect, Layer, ManagedRuntime } from 'effect'
import { notFound } from '../tracker/cdn-answer.ts'
import { remember } from '../tracker/remember.ts'
import { CpuClock } from '../tracker/report.ts'
import { browserFileResponse, manifestResponse, trackerAnswers } from '../tracker/routes.ts'
import { runOn, trackerLayer } from '../tracker/runtime.ts'
import { DEFAULT_SCENARIO } from '../tracker/simulation/scenarios.ts'
import { readTimetable, type ReadTimetableFile } from '../tracker/timetable.ts'

export type { ReadTimetableFile }

export interface DemoSettings {
  readonly read: ReadTimetableFile
  /** Layers beneath the tracker, such as a clock that starts at a recording's moment. */
  readonly beneath?: Layer.Layer<never>
}

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
export function demoRoutes({ read: readFolder, beneath = Layer.empty }: DemoSettings) {
  // The manifest is read once, so the tracker and the network's files hold the same version for
  // the page's life, as the deployment it opened on; a read that fails is tried again.
  const manifest = remember(() => readFolder('manifest.json'))
  const read: ReadTimetableFile = (file) =>
    file === 'manifest.json' ? manifest() : readFolder(file)

  // The tracker's runtime, built at the first ask for it; a build that fails, such as on a
  // dropped connection, is forgotten, so the next ask tries again, as the server's runtime does.
  const runtime = remember(async () => {
    const timetable = await readTimetable(read)
    const source = { kind: 'simulated', scenario: DEFAULT_SCENARIO } as const
    return ManagedRuntime.make(
      trackerLayer({ timetable, source, cpu: workerCpu }).pipe(Layer.provideMerge(beneath)),
    )
  })

  const answers = trackerAnswers(runOn(runtime))

  return async function route(path: string): Promise<Response> {
    const [api, name, ...rest] = segmentsOf(path) ?? []
    if (api !== 'api') return notFound('route')
    if (name === 'snapshot' && rest.length === 0) return answers.snapshot()
    if (name === 'disruptions' && rest.length === 0) return answers.disruptions()
    if (name === 'stops' && rest.length === 1) return answers.stop(rest[0])
    if (name === 'trips' && rest.length === 1) return answers.trip(rest[0])
    // The network's files come straight from the folder, so the map draws its lines without
    // waiting for the tracker's timetable.
    if (name === 'timetable' && rest.length === 0) return manifestResponse(read)
    if (name === 'timetable' && rest.length === 2)
      return browserFileResponse(read, rest[0], rest[1])
    return notFound('route')
  }
}
