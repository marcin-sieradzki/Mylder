import { describe, expect, it } from 'vitest'
import { timetableFileResponse, timetableManifestResponse } from './routes.ts'
import { readSource } from './source.ts'

// The browser's timetable files, served from the tracker's own timetable: here the weekday
// recording's, as `MYLDER_SOURCE=recording:weekday` sets it.
const recording = readSource('recording:weekday')
const VERSION = '2026-06-02-4f2b8119'

describe('the timetable routes', () => {
  it('answer the current manifest, kept only briefly since a deployment can change it', async () => {
    const response = await timetableManifestResponse(recording)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
    const manifest = (await response.json()) as { version: string }
    expect(manifest.version).toBe(VERSION)
  })

  it("answer a version's stops, kept for good since a version never changes", async () => {
    const response = await timetableFileResponse(VERSION, 'stops', recording)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    const stops = (await response.json()) as { stops: { name: string }[] }
    expect(stops.stops).toHaveLength(109)
    expect(stops.stops.map((stop) => stop.name)).toContain('Nørreport St.')
  })

  it("answer a version's manifest, patterns and paths", async () => {
    for (const file of ['manifest', 'patterns', 'paths']) {
      expect((await timetableFileResponse(VERSION, file, recording)).status).toBe(200)
    }
    const patterns = (await (
      await timetableFileResponse(VERSION, 'patterns', recording)
    ).json()) as {
      lines: { name: string }[]
    }
    expect(patterns.lines.map((line) => line.name)).toEqual(['5C', '991', 'M1', 'A', 'E', 'RE'])
  })

  it('answer 404 for the trips, which the browser never loads, and for any other file', async () => {
    for (const file of ['trips', 'day-profiles', 'dayProfiles', '../manifest.json']) {
      expect((await timetableFileResponse(VERSION, file, recording)).status).toBe(404)
    }
  })

  it('answer 404 for a version the tracker does not hold', async () => {
    const response = await timetableFileResponse('2026-10-25-6495dcc6', 'stops', recording)
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
