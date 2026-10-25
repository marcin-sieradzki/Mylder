import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPaths } from '../../src/timetable/paths.ts'
import { readPatterns } from '../../src/timetable/patterns.ts'
import { readStops } from '../../src/timetable/stops.ts'
import { forEachRow } from './csv.ts'
import { FIXTURE, prepareFixture } from './testing.ts'

async function prepare() {
  const { manifest, logs, read } = await prepareFixture()
  return {
    manifest,
    logs,
    stops: readStops(read(manifest.files.stops)),
    patterns: readPatterns(read(manifest.files.patterns)),
    paths: readPaths(read(manifest.files.paths)),
  }
}

type Patterns = Awaited<ReturnType<typeof prepare>>['patterns']

function find(patterns: Patterns, line: string, headsign: string, stops?: number) {
  const found = patterns.patterns.filter(
    (p) =>
      patterns.lines[p.line].name === line &&
      p.headsign === headsign &&
      (stops === undefined || p.stops.length === stops),
  )
  expect(found).toHaveLength(1)
  return found[0]
}

// Metres between two points, by the haversine formula.
function metres([latA, lonA]: readonly number[], [latB, lonB]: readonly number[]): number {
  const rad = Math.PI / 180
  const h =
    Math.sin(((latB - latA) * rad) / 2) ** 2 +
    Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(((lonB - lonA) * rad) / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h))
}

// Metres from a point to the nearest point of a polyline, sampling each leg every metre or so.
function metresToLine(point: readonly number[], line: readonly (readonly number[])[]): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    const steps = Math.max(1, Math.ceil(metres(a, b)))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      best = Math.min(best, metres(point, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))
    }
  }
  return best
}

describe('patterns', () => {
  it('gives one pattern per line, direction and stop sequence', async () => {
    const { patterns } = await prepare()

    const summary = patterns.patterns
      .map((p) => {
        const line = patterns.lines[p.line]
        return `${line.mode} ${line.name} ${p.direction} ${p.headsign} (${p.stops.length})`
      })
      .sort()
    expect(summary).toEqual([
      'bus 5C 0 Sundbyvester Plads (35)',
      'bus 5C 0 Sundbyvester Plads (39)',
      'bus 5C 1 Husum Torv (35)',
      'bus 991 0 Teglholmen (11)',
      'metro M1 0 Vestamager St. (Metro) (15)',
      'metro M1 1 Vanløse St. (Metro) (15)',
      's-tog A 0 Hundige St. (29)',
      's-tog A 0 København H (18)',
      's-tog A 1 Hillerød St. (30)',
      's-tog E 0 Køge St. (32)',
      's-tog E 1 Holte St. (32)',
      'train RE 0 Næstved St. (11)',
    ])
  })

  it("lists a pattern's platforms in calling order", async () => {
    const { patterns, stops } = await prepare()

    const a = find(patterns, 'A', 'Hundige St.')
    const names = a.stops.map((i) => stops.platforms[i].name)
    expect(names.slice(0, 3)).toEqual(['Hillerød St.', 'Favrholm St.', 'Allerød St.'])
    expect(names.at(-1)).toBe('Hundige St.')
  })

  it('gives each pattern a key that names its content, not its GTFS ids', async () => {
    const { patterns } = await prepare()

    const keys = patterns.patterns.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(find(patterns, 'M1', 'Vanløse St. (Metro)').key).toMatch(/^[0-9a-f]{10}$/)
  })
})

describe('paths', () => {
  it('cuts a path at every stop, one segment per stop pair, end to end', async () => {
    const { patterns, paths, stops } = await prepare()

    for (const pattern of patterns.patterns) {
      expect(pattern.segments).toHaveLength(pattern.stops.length - 1)
      const legs = pattern.segments.map((s) => paths.points(s))
      legs.forEach((leg, i) => {
        expect(leg.length).toBeGreaterThanOrEqual(2)
        // A segment starts where its stop's platform meets the path.
        const platform = stops.platforms[pattern.stops[i]]
        expect(metres(leg[0], [platform.lat, platform.lon])).toBeLessThan(60)
      })
      // Each segment starts where the one before it ends.
      expect(legs.slice(1).map((leg) => leg[0])).toEqual(legs.slice(0, -1).map((l) => l.at(-1)))
    }
  })

  it('shares the segments of patterns that run along the same street', async () => {
    const { patterns } = await prepare()

    const shared = (a: readonly number[], b: readonly number[]) =>
      a.filter((s) => b.includes(s)).length
    // 5C's two southbound patterns run the same street from Husumvej to Sundbyvester Plads.
    const herlev = find(patterns, '5C', 'Sundbyvester Plads', 39)
    const husum = find(patterns, '5C', 'Sundbyvester Plads', 35)
    expect(shared(herlev.segments, husum.segments)).toBe(33)
    // A's late trip to København H runs on A's tracks from Hillerød.
    const late = find(patterns, 'A', 'København H')
    const hundige = find(patterns, 'A', 'Hundige St.')
    expect(shared(late.segments, hundige.segments)).toBe(17)
  })

  it('keeps the simplified path within 5 m of the original shape', async () => {
    const { patterns, paths, stops } = await prepare()

    const shape: number[][] = []
    await forEachRow(
      join(FIXTURE, 'shapes.txt'),
      ['shape_id', 'shape_pt_lat', 'shape_pt_lon'],
      ([id, lat, lon]) => {
        if (id === '6741') shape.push([+lat, +lon])
      },
    )
    const pattern = find(patterns, '5C', 'Husum Torv')
    const path = pattern.segments.flatMap((s) => paths.points(s))
    expect(path.length).toBeLessThan(shape.length / 2)

    // The shape's points between the first stop and the last.
    const nearest = (i: number) => {
      const p = stops.platforms[i]
      let best = 0
      shape.forEach((point, j) => {
        if (metres(point, [p.lat, p.lon]) < metres(shape[best], [p.lat, p.lon])) best = j
      })
      return best
    }
    const between = shape.slice(nearest(pattern.stops[0]) + 1, nearest(pattern.stops.at(-1)!))
    expect(between.length).toBeGreaterThan(100)
    for (const point of between) expect(metresToLine(point, path)).toBeLessThanOrEqual(5)
  })
})

describe('line colours', () => {
  it("takes Perron's line token where there is one, else the mode's", async () => {
    const { patterns } = await prepare()

    const colour = (name: string) => patterns.lines.find((l) => l.name === name)?.colour
    expect(colour('A')).toBe('perron-color-transit-line-a')
    expect(colour('M1')).toBe('perron-color-transit-line-m1')
    expect(colour('5C')).toBe('perron-color-transit-mode-bus')
    expect(colour('RE')).toBe('perron-color-transit-mode-regional')
  })

  it('logs each line that took its mode colour', async () => {
    const { logs } = await prepare()

    expect(logs).toContainEqual(expect.stringMatching(/perron-color-transit-mode-regional.*\bRE\b/))
    expect(logs).toContainEqual(expect.stringMatching(/perron-color-transit-mode-bus.*\b5C\b/))
    expect(logs.join('\n')).not.toMatch(/\bM1\b/)
  })
})
