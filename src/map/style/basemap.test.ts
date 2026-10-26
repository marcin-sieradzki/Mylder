import '@mylder/perron/tokens.css'
import type { FeatureCollection, MultiLineString } from 'geojson'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  GeoJSONSourceSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import { afterEach, describe, expect, it } from 'vitest'
import { readNetwork } from '../../timetable/network.ts'
import { readPaint } from '../paint.ts'
import { basemapStyle, paintTokens } from './basemap.ts'

// The basemap as the page paints it: Perron's own token sheet on the document, and the weekday
// recording's network (lines 5C, 991, M1, A, E and RE).
const dir = join(process.cwd(), 'recordings', 'weekday', 'timetable')
const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'))
const manifest = read('manifest.json') as { files: Record<string, string> }
const network = readNetwork({
  manifest,
  stops: read(manifest.files.stops),
  patterns: read(manifest.files.patterns),
  paths: read(manifest.files.paths),
})

const styleNow = () =>
  basemapStyle(readPaint(document.documentElement, paintTokens(network)), network)

const layer = (style: StyleSpecification, id: string) => {
  const found = style.layers.find((each) => each.id === id)
  if (!found) throw new Error(`no layer ${id}`)
  return found as LayerSpecification & { paint: Record<string, unknown> }
}

const features = (style: StyleSpecification, source: string) => {
  const data = (style.sources[source] as GeoJSONSourceSpecification).data
  return (data as FeatureCollection).features
}

const lineColours = (style: StyleSpecification) =>
  Object.fromEntries(
    features(style, 'mylder-lines').map((f) => [f.properties!.line, f.properties!.colour]),
  )

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('the basemap', () => {
  it("paints Positron's land, water and parks in Perron's light map colours", () => {
    const style = styleNow()
    expect(layer(style, 'background').paint['background-color']).toBe('#EDEFEB')
    expect(layer(style, 'water').paint['fill-color']).toBe('#C4D4DD')
    expect(layer(style, 'park').paint['fill-color']).toBe('#D8E4D2')
  })

  it('paints the same map dark under a dark theme', () => {
    document.documentElement.dataset.theme = 'dark'
    const style = styleNow()
    expect(layer(style, 'background').paint['background-color']).toBe('#151B1E')
    expect(layer(style, 'water').paint['fill-color']).toBe('#0A1115')
  })

  it('draws on OpenFreeMap tiles, with no road shields', () => {
    const style = styleNow()
    expect(style.sources.openmaptiles).toMatchObject({
      url: 'https://tiles.openfreemap.org/planet',
    })
    expect(style.layers.filter((each) => /shield/.test(each.id))).toEqual([])
  })

  it("draws each Metro, S-tog and train line in its line's colour, or its mode's", () => {
    expect(lineColours(styleNow())).toEqual({
      M1: '#0B8A44',
      A: '#00A1DE',
      E: '#7D5AA6',
      RE: '#232C31',
    })
    document.documentElement.dataset.theme = 'dark'
    expect(lineColours(styleNow()).RE).toBe('#EEF1F0')
  })

  it("draws each line at its mode's width and opacity", () => {
    const widths = Object.fromEntries(
      features(styleNow(), 'mylder-lines').map((f) => [
        f.properties!.line,
        [f.properties!.width, f.properties!.opacity],
      ]),
    )
    expect(widths).toEqual({ M1: [3.2, 0.78], A: [2.5, 0.78], E: [2.5, 0.78], RE: [2.1, 0.5] })
  })

  it("follows each line's paths, joined from its patterns' segments", () => {
    const m1 = features(styleNow(), 'mylder-lines').find((f) => f.properties!.line === 'M1')!
    const geometry = m1.geometry as MultiLineString
    expect(geometry.type).toBe('MultiLineString')
    // Kongens Nytorv, on M1, is on its path, in longitude and latitude.
    const points = geometry.coordinates.flat()
    expect(
      points.some(([lon, lat]) => Math.abs(lon - 12.585) < 0.003 && Math.abs(lat - 55.68) < 0.003),
    ).toBe(true)
  })

  it('leaves the bus routes out at rest, as Perron draws a bus route only in focus', () => {
    expect(Object.keys(lineColours(styleNow()))).not.toContain('5C')
  })

  it('draws every stop, above the lines and under the place names', () => {
    const style = styleNow()
    expect(features(style, 'mylder-stops')).toHaveLength(109)
    const index = (id: string) => style.layers.findIndex((each) => each.id === id)
    const firstLabel = style.layers.findIndex((each) => each.type === 'symbol')
    expect(index('mylder-lines-metro')).toBeGreaterThan(index('mylder-lines-train'))
    expect(index('mylder-stops-rail')).toBeGreaterThan(index('mylder-lines-metro'))
    expect(index('mylder-stops-rail')).toBeLessThan(firstLabel)
  })

  it('draws the basemap alone until the network has loaded', () => {
    const style = basemapStyle(readPaint(document.documentElement, paintTokens()))
    expect(layer(style, 'background').paint['background-color']).toBe('#EDEFEB')
    expect(style.sources['mylder-lines']).toBeUndefined()
  })
})
