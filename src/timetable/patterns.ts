import type { LineRecord, PatternRecord, PatternsFile } from './format.ts'
import { array, number, object, string, TimetableFormatError } from './parse.ts'
import { readMode } from './stops.ts'

/** Parses the patterns file. */
export function readPatterns(json: unknown): PatternsFile {
  const file = object(json, 'patterns file')
  const lines = array(file.lines, 'lines').map(readLine)
  const patterns = array(file.patterns, 'patterns').map((value, i) => {
    const pattern = readPattern(value, i)
    if (!lines[pattern.line]) {
      throw new TimetableFormatError(`patterns[${i}] names a line that is not in the file`)
    }
    return pattern
  })
  return { lines, patterns }
}

function readLine(value: unknown, i: number): LineRecord {
  const what = `lines[${i}]`
  const line = object(value, what)
  return {
    name: string(line.name, `${what}.name`),
    mode: readMode(line.mode, `${what}.mode`),
    colour: string(line.colour, `${what}.colour`),
  }
}

function readPattern(value: unknown, i: number): PatternRecord {
  const what = `patterns[${i}]`
  const pattern = object(value, what)
  return {
    key: string(pattern.key, `${what}.key`),
    line: number(pattern.line, `${what}.line`),
    direction: number(pattern.direction, `${what}.direction`),
    headsign: string(pattern.headsign, `${what}.headsign`),
    stops: array(pattern.stops, `${what}.stops`).map((s) => number(s, `${what}.stops`)),
    segments: array(pattern.segments, `${what}.segments`).map((s) => number(s, `${what}.segments`)),
  }
}
