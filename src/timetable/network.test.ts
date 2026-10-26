import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readNetwork } from './network.ts'

// The weekday recording's timetable: the fixture feed, prepared by the timetable job.
const dir = join(process.cwd(), 'recordings', 'weekday', 'timetable')
const json = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'))
const manifest = json('manifest.json') as { files: Record<string, string> }
const files = () => ({
  manifest,
  stops: json(manifest.files.stops),
  patterns: json(manifest.files.patterns),
  paths: json(manifest.files.paths),
})

describe('the network reader', () => {
  it('reads the lines, their patterns and the stops the trips call at', () => {
    const network = readNetwork(files())
    expect(network.manifest.version).toBe('2026-06-02-4f2b8119')
    expect(network.patterns.lines.map((line) => line.name)).toEqual([
      '5C',
      '991',
      'M1',
      'A',
      'E',
      'RE',
    ])
    expect(network.patterns.patterns).toHaveLength(12)
    expect(network.stops.stops).toHaveLength(109)
    expect(network.stops.stopForPlatform('000008600626')?.name).toBe('København H')
  })

  it("measures a pattern's path once, from its first stop to its last", () => {
    const network = readNetwork(files())
    const path = network.pathOf(0)
    expect(network.pathOf(0)).toBe(path)
    expect(path.stops[0]).toBe(0)
    expect(path.stops.at(-1)).toBe(path.length)
    expect(path.stops).toHaveLength(network.patterns.patterns[0].stops.length)
  })

  it('fails loudly on a file of the wrong shape', () => {
    expect(() => readNetwork({ ...files(), patterns: { lines: [] } })).toThrow(
      'patterns is not an array',
    )
  })
})
