import { describe, expect, it } from 'vitest'
import { readManifest } from '../../src/timetable/manifest.ts'
import { readStops } from '../../src/timetable/stops.ts'
import { prepareFixture } from './testing.ts'

async function prepare() {
  return prepareFixture()
}

describe('the manifest', () => {
  it('names the version, source, window and box the files were prepared from', async () => {
    const { manifest, read } = await prepare()
    const parsed = readManifest(read('manifest.json'))

    expect(parsed).toEqual(manifest)
    expect(parsed.version).toBe('2026-06-02-4f2b8119')
    expect(parsed.sourceHash).toBe(
      '4f2b8119f3dfa34ea89863353cd4980498fac8c75b37b293747f71ce5d3e3a62',
    )
    expect(parsed.preparedDate).toBe('2026-06-02')
    expect(parsed.window).toEqual({ first: '2026-06-01', last: '2026-08-26' })
    expect(parsed.timezone).toBe('Europe/Copenhagen')
    expect(parsed.box).toEqual({ south: 55.45, west: 12.05, north: 56.05, east: 12.7 })
  })

  it('names files by version, so a cache can keep them for ever', async () => {
    const { manifest, read } = await prepare()
    expect(manifest.files.stops).toBe('2026-06-02-4f2b8119/stops.json')
    const stops = readStops(read(manifest.files.stops))
    expect(manifest.counts).toMatchObject({
      stops: stops.stops.length,
      platforms: stops.platforms.length,
    })
  })
})

describe('cutting to the Copenhagen box', () => {
  it('drops a stop outside the box that only trips outside the box serve', async () => {
    const { manifest, read } = await prepare()
    const stops = readStops(read(manifest.files.stops))

    // Odense Letbane's line L never enters the box.
    expect(stops.stopForPlatform('8608701')).toBeUndefined()
    expect(stops.platforms.some((p) => p.name.includes('Odense Letbane'))).toBe(false)
  })

  it('keeps the calls outside the box of a trip that leaves it', async () => {
    const { manifest, read } = await prepare()
    const stops = readStops(read(manifest.files.stops))

    // The RE to Næstved leaves the box after Køge Nord and calls at Næstved St.
    expect(stops.stopForPlatform('8600810')?.name).toBe('Næstved St.')
  })
})

describe('grouping platforms into stops', () => {
  it("resolves Nørreport's train, Metro and bus platforms to one Stop", async () => {
    const { manifest, read } = await prepare()
    const stops = readStops(read(manifest.files.stops))

    const train = stops.stopForPlatform('8600646')
    expect(train?.name).toBe('Nørreport St.')
    for (const platform of ['8603307', '27532', '50461']) {
      expect(stops.stopForPlatform(platform)).toBe(train)
    }
    expect(train?.modes).toEqual(['bus', 'metro', 's-tog'])
  })

  it("resolves the API's platform id after stripping or padding zeros", async () => {
    const { manifest, read } = await prepare()
    const stops = readStops(read(manifest.files.stops))

    const kobenhavnH = stops.stopForPlatform('8600626')
    expect(kobenhavnH?.name).toBe('København H')
    expect(stops.stopForPlatform('000008600626')).toBe(kobenhavnH)
    expect(stops.stopForPlatform('0008600626')).toBe(kobenhavnH)
    expect(stops.stopForPlatform('8600627')).toBeUndefined()
  })
})
