import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The timetable routes as the server answers them on the weekday recording: each version's files
 * from its `timetable/` folder, for screen tests to stub `fetch` with. jsdom has no server to
 * reach.
 */
export const timetableRoutes = async (input: RequestInfo | URL): Promise<Response> => {
  const folder = join(process.cwd(), 'recordings', 'weekday', 'timetable')
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')) as {
    version: string
    files: Record<string, string>
  }
  const [, version, file] = /^\/api\/timetable\/([^/]+)\/(\w+)$/.exec(String(input)) ?? []
  if (version !== manifest.version) return new Response(null, { status: 404 })
  const body =
    file === 'manifest'
      ? JSON.stringify(manifest)
      : readFileSync(join(folder, manifest.files[file]), 'utf8')
  return new Response(body, { headers: { 'content-type': 'application/json' } })
}
