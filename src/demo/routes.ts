// The demo's routes (ADR 0013): the server's tracker on the simulated Rejseplanen, built from the
// timetable files the demo serves, answering each route the page asks for by its path as
// `app/api/` does, with the same answers and the same date header.
import { Effect, Layer, ManagedRuntime } from 'effect'
import { readManifest } from '../timetable/manifest.ts'
import { CpuClock } from '../tracker/report.ts'
import { trackerAnswers } from '../tracker/routes.ts'
import { runOn, trackerLayer } from '../tracker/runtime.ts'
import { DEFAULT_SCENARIO } from '../tracker/simulation/scenarios.ts'
import { isBrowserFile, timetableFrom } from '../tracker/timetable.ts'

/** Reads one of the timetable folder's files by its name in the manifest, as text. */
export type ReadTimetableFile = (file: string) => Promise<string>

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

const notFound = (what: string) =>
  Response.json(
    { error: `unknown ${what}` },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  )

const json = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'application/json' } })

async function load(read: ReadTimetableFile, beneath: Layer.Layer<never>) {
  const manifestText = await read('manifest.json')
  const manifest = readManifest(JSON.parse(manifestText))
  const { files } = manifest
  const [stops, patterns, paths, trips] = await Promise.all(
    [files.stops, files.patterns, files.paths, files.trips].map(async (file) =>
      JSON.parse(await read(file)),
    ),
  )
  const timetable = timetableFrom({ manifest, stops, patterns, paths, trips })
  const source = { kind: 'simulated', scenario: DEFAULT_SCENARIO } as const
  const runtime = ManagedRuntime.make(
    trackerLayer({ timetable, source, cpu: workerCpu }).pipe(Layer.provideMerge(beneath)),
  )
  return { manifestText, manifest, runtime }
}

/** The demo's routes, answering a path such as `/api/snapshot` or `/api/stops/<id>`. */
export function demoRoutes({ read, beneath = Layer.empty }: DemoSettings) {
  // Loaded at the first ask; a load that fails, such as on a dropped connection, is forgotten, so
  // the next ask tries again, as the server's runtime does.
  let loading: ReturnType<typeof load> | undefined
  const loaded = () => {
    if (!loading) {
      loading = load(read, beneath)
      loading.catch(() => {
        loading = undefined
      })
    }
    return loading
  }

  const answers = trackerAnswers(runOn(async () => (await loaded()).runtime))

  /** The current manifest, or one of the files of its version the browser loads. */
  async function timetableFile(version: string, file: string): Promise<Response> {
    const { manifest, manifestText } = await loaded()
    if (!isBrowserFile(file)) return notFound('timetable file')
    if (version !== manifest.version) return notFound('timetable version')
    return json(file === 'manifest' ? manifestText : await read(manifest.files[file]))
  }

  return async function route(path: string): Promise<Response> {
    const [api, name, ...rest] = new URL(path, 'http://mylder').pathname
      .split('/')
      .slice(1)
      .map(decodeURIComponent)
    if (api !== 'api') return notFound('route')
    if (name === 'snapshot' && rest.length === 0) return answers.snapshot()
    if (name === 'disruptions' && rest.length === 0) return answers.disruptions()
    if (name === 'stops' && rest.length === 1) return answers.stop(rest[0])
    if (name === 'trips' && rest.length === 1) return answers.trip(rest[0])
    if (name === 'timetable' && rest.length === 0) return json((await loaded()).manifestText)
    if (name === 'timetable' && rest.length === 2) return timetableFile(rest[0], rest[1])
    return notFound('route')
  }
}
