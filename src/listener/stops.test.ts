// The box's stops (#217): the listener learns them from the app's public timetable routes, here a
// stub app serving the SIRI-ET recording's timetable, and keeps them when the app can't be reached.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBox } from '../siri-et/recording'
import { createListener } from './listener'
import type { LogLine } from './log'
import { checkStops } from './stops'

const TIMETABLE = join(process.cwd(), 'recordings', 'siri-et', 'timetable')
const manifest = JSON.parse(await readFile(join(TIMETABLE, 'manifest.json'), 'utf8'))
const stops = JSON.parse(await readFile(join(TIMETABLE, manifest.files.stops), 'utf8'))
const box = await readBox(TIMETABLE)
const APP = 'https://mylder.example'
const TOKEN = 'a-test-token-of-the-listener-0123456789abcdef'

/**
 * The app's timetable routes, serving `version`'s manifest and stops while `up`, and the URLs it
 * was asked for.
 */
function stubApp() {
  const app = { up: true, version: manifest.version as string, asked: [] as string[] }
  const fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input)
    app.asked.push(url)
    if (!app.up) throw new TypeError('fetch failed')
    if (url === `${APP}/api/timetable`) {
      return Response.json({ ...manifest, version: app.version })
    }
    if (url === `${APP}/api/timetable/${app.version}/stops`) {
      // A new version has no platforms, so the two boxes differ.
      return Response.json(app.version === manifest.version ? stops : withoutPlatforms(stops))
    }
    return new Response(null, { status: 404 })
  }
  return { app, fetch: fetch as typeof globalThis.fetch }
}

/** A stops file with no platforms, only stops, as a version unlike the recording's. */
const withoutPlatforms = (file: typeof stops) => ({ ...file, platforms: [] })

function listenerWithApp() {
  const { app, fetch } = stubApp()
  const listener = createListener({ token: TOKEN, version: 'test', startedAt: 0, now: () => 0 })
  const lines: LogLine[] = []
  const check = () => checkStops({ appUrl: APP, fetch, listener, log: (line) => lines.push(line) })
  const table = () =>
    listener.handle(
      new Request('https://listener.example/table', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    ).status
  return { app, listener, check, lines, table }
}

describe('the box’s stops, from the app', () => {
  it('learns them from the app’s manifest and stops routes', async () => {
    const { app, listener, check, table } = listenerWithApp()
    expect(table()).toBe(503)
    await check()
    expect(app.asked).toEqual([
      `${APP}/api/timetable`,
      `${APP}/api/timetable/${manifest.version}/stops`,
    ])
    expect(listener.box()).toEqual(box)
    expect(table()).toBe(200)
  })

  it('reads the stops again only when the manifest names a new version', async () => {
    const { app, listener, check } = listenerWithApp()
    await check()
    await check()
    expect(app.asked.filter((url) => url.endsWith('/stops'))).toHaveLength(1)
    app.version = 'next-version'
    await check()
    expect(app.asked.at(-1)).toBe(`${APP}/api/timetable/next-version/stops`)
    expect(listener.box()?.timetableVersion).toBe('next-version')
    expect(listener.box()?.stops.size).toBeLessThan(box.stops.size)
  })

  it('keeps the set it has when the app can’t be reached, and logs it', async () => {
    const { app, listener, check, lines, table } = listenerWithApp()
    await check()
    app.up = false
    app.version = 'next-version'
    await check()
    expect(listener.box()).toEqual(box)
    expect(table()).toBe(200)
    expect(lines.at(-1)).toMatchObject({
      level: 'warn',
      message: expect.stringMatching(
        /couldn’t read the app’s timetable.*keeps 2026-11-01-6495dcc6/,
      ),
    })
  })

  it('has no set, and so serves 503, while the app has never been reached', async () => {
    const { app, listener, check, lines, table } = listenerWithApp()
    app.up = false
    await check()
    expect(listener.box()).toBeUndefined()
    expect(table()).toBe(503)
    expect(lines.at(-1)?.message).toMatch(/has no stops yet/)
  })

  it('keeps the set it has when the app answers with an error or a broken file', async () => {
    const { listener, lines } = listenerWithApp()
    const failing = (async () => new Response('oops', { status: 500 })) as typeof fetch
    await checkStops({
      appUrl: APP,
      fetch: stubApp().fetch,
      listener,
      log: (line) => lines.push(line),
    })
    await checkStops({ appUrl: APP, fetch: failing, listener, log: (line) => lines.push(line) })
    const broken = (async () => Response.json({ version: 'x' })) as typeof fetch
    await checkStops({ appUrl: APP, fetch: broken, listener, log: (line) => lines.push(line) })
    expect(listener.box()).toEqual(box)
    expect(lines.filter((line) => line.level === 'warn')).toHaveLength(2)
  })
})
