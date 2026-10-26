import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { timetableLoader } from './timetable.ts'

// The browser's side of the timetable routes, answered from the weekday recording's files as the
// routes would serve them under `MYLDER_SOURCE=recording:weekday`.
const VERSION = '2026-06-02-4f2b8119'
const dir = join(process.cwd(), 'recordings', 'weekday', 'timetable')
const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'))

function server() {
  const requests: string[] = []
  const files: Record<string, string> = {
    '/api/timetable': 'manifest.json',
    [`/api/timetable/${VERSION}/manifest`]: 'manifest.json',
    [`/api/timetable/${VERSION}/stops`]: `${VERSION}/stops.json`,
    [`/api/timetable/${VERSION}/patterns`]: `${VERSION}/patterns.json`,
    [`/api/timetable/${VERSION}/paths`]: `${VERSION}/paths.json`,
    [`/api/timetable/${VERSION}/dayProfiles`]: `${VERSION}/day-profiles.json`,
  }
  const fetchJson = async (path: string) => {
    requests.push(path)
    if (!files[path]) throw new Error(`404 for ${path}`)
    return read(files[path])
  }
  return { requests, fetchJson }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the timetable loader', () => {
  it("starts from the current manifest and loads that version's network", async () => {
    const { fetchJson, requests } = server()
    const network = await timetableLoader(fetchJson).current()
    expect(network.manifest.version).toBe(VERSION)
    expect(network.patterns.lines.map((line) => line.name)).toContain('M1')
    expect(network.stops.stops).toHaveLength(109)
    expect(requests.sort()).toEqual([
      '/api/timetable',
      `/api/timetable/${VERSION}/paths`,
      `/api/timetable/${VERSION}/patterns`,
      `/api/timetable/${VERSION}/stops`,
    ])
  })

  it('loads each version once, however often it is asked for', async () => {
    const { fetchJson, requests } = server()
    const loader = timetableLoader(fetchJson)
    const current = await loader.current()
    const [again, byVersion] = await Promise.all([loader.current(), loader.version(VERSION)])
    expect(again).toBe(current)
    expect(byVersion).toBe(current)
    expect(requests).toHaveLength(4)
  })

  it('loads a version a snapshot names that it has not loaded, with its own manifest', async () => {
    const { fetchJson, requests } = server()
    const network = await timetableLoader(fetchJson).version(VERSION)
    expect(network.manifest.version).toBe(VERSION)
    expect(requests).toContain(`/api/timetable/${VERSION}/manifest`)
  })

  it("loads a version's day profiles once, apart from its network", async () => {
    const { fetchJson, requests } = server()
    const loader = timetableLoader(fetchJson)
    const [profiles, again] = await Promise.all([
      loader.dayProfiles(VERSION),
      loader.dayProfiles(VERSION),
    ])
    expect(again).toBe(profiles)
    // The weekday recording's Tuesday: 14 trips underway at 07:30, the morning's most.
    expect(profiles.day('2026-06-16')?.[30]).toBe(14)
    expect(requests).toEqual([`/api/timetable/${VERSION}/dayProfiles`])
  })

  it('tries a failed version again only once a while has passed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { fetchJson, requests } = server()
    const loader = timetableLoader(fetchJson)
    const stops = () => requests.filter((path) => path.endsWith('/stops'))
    await expect(loader.version('2026-10-25-6495dcc6')).rejects.toThrow('404')
    await expect(loader.version('2026-10-25-6495dcc6')).rejects.toThrow('404')
    expect(stops()).toHaveLength(1)
    vi.advanceTimersByTime(30_000)
    await expect(loader.version('2026-10-25-6495dcc6')).rejects.toThrow('404')
    expect(stops()).toHaveLength(2)
  })

  it('asks for the current manifest again a while after it failed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { fetchJson, requests } = server()
    let down = true
    const loader = timetableLoader((path) =>
      down ? Promise.reject(new Error(`503 for ${path}`)) : fetchJson(path),
    )
    await expect(loader.current()).rejects.toThrow('503')
    down = false
    await expect(loader.current()).rejects.toThrow('503')
    vi.advanceTimersByTime(30_000)
    expect((await loader.current()).manifest.version).toBe(VERSION)
    expect(requests).toContain('/api/timetable')
  })
})
