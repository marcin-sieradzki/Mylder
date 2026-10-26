// Where lines share a track, each is drawn as its own strand beside the others (Perron's map
// foundation, "Lines and dots"). Which lines share a stretch comes from the timetable: the lines
// of one mode that run between the same two stops. There they keep their strands' order, a track
// spacing apart and centred on the track; a line alone on its track is drawn on its centre.
import 'client-only'
import type { LineRecord, Mode } from '../../timetable/format.ts'
import type { Network } from '../../timetable/network.ts'

/** One line's segments on one stretch, all running the same way, and its strand there. */
export interface Strand {
  readonly line: LineRecord
  readonly segments: readonly number[]
  /**
   * Its place from the track's centre, in track spacings, to the right of the way its segments
   * run, as MapLibre's `line-offset` counts.
   */
  readonly place: number
}

/** A line's segments on a stretch, along the stretch's way and against it. */
interface Runs {
  readonly along: number[]
  readonly against: number[]
}

/** The track between two stops, the stop its way starts from, and each mode's lines on it. */
interface Stretch {
  start?: number
  readonly lines: Map<Mode, Map<number, Runs>>
}

/** A pattern's step from one stop to the next. */
interface Step {
  readonly from: number
  readonly to: number
  readonly stretch: Stretch
  readonly segment: number
}

const built = new WeakMap<Network, Stretch[]>()

/**
 * The stretches the rail lines run, each given one way so that every pattern runs all its
 * stretches along their way or all against it: a line's strand then stays on one side of the
 * track the whole way, and two lines that share a run never cross. A bus route is drawn only in
 * focus, alone, so it has no strand.
 */
function stretchesOf(network: Network): Stretch[] {
  const found = built.get(network)
  if (found) return found
  const { lines, patterns } = network.patterns
  const stopOf = (platform: number) => network.stops.platforms[platform].stop
  const byStops = new Map<string, Stretch>()
  const steps: Step[][] = patterns.map(() => [])
  const patternsOn = new Map<Stretch, number[]>()
  patterns.forEach((pattern, index) => {
    if (lines[pattern.line].mode === 'bus') return
    pattern.segments.forEach((segment, i) => {
      const from = stopOf(pattern.stops[i])
      const to = stopOf(pattern.stops[i + 1])
      const key = from < to ? `${from}-${to}` : `${to}-${from}`
      let stretch = byStops.get(key)
      if (!stretch) {
        byStops.set(key, (stretch = { lines: new Map() }))
        patternsOn.set(stretch, [])
      }
      steps[index].push({ from, to, stretch, segment })
      patternsOn.get(stretch)!.push(index)
    })
  })

  // Outwards from a pattern that shares no stretch with one already placed: each pattern takes
  // the way of a stretch the pattern before it placed, and gives that way to the rest of its own.
  const placed = new Set<number>()
  for (let seed = 0; seed < patterns.length; seed++) {
    if (placed.has(seed) || steps[seed].length === 0) continue
    placed.add(seed)
    const queue = [seed]
    while (queue.length > 0) {
      const index = queue.shift()!
      const pattern = patterns[index]
      const known = steps[index].find(({ stretch }) => stretch.start !== undefined)
      const forward = known === undefined || known.stretch.start === known.from
      const mode = lines[pattern.line].mode
      for (const { from, to, stretch, segment } of steps[index]) {
        stretch.start ??= forward ? from : to
        let ofMode = stretch.lines.get(mode)
        if (!ofMode) stretch.lines.set(mode, (ofMode = new Map()))
        let runs = ofMode.get(pattern.line)
        if (!runs) ofMode.set(pattern.line, (runs = { along: [], against: [] }))
        const way = stretch.start === from ? runs.along : runs.against
        if (!way.includes(segment)) way.push(segment)
        for (const next of patternsOn.get(stretch)!) {
          if (placed.has(next)) continue
          placed.add(next)
          queue.push(next)
        }
      }
    }
  }
  const stretches = [...byStops.values()]
  built.set(network, stretches)
  return stretches
}

/**
 * Each rail line's strands: on every stretch, the segments it draws there and its place. A line
 * draws a stretch once, along the stretch's way where it runs that way, so its way back is the
 * same strand. `strandOf` gives a line's strand on the full trunk, which orders the lines of a
 * stretch; lines with the same strand, or none, follow their names.
 */
export function strandsOf(network: Network, strandOf: (line: LineRecord) => number): Strand[] {
  const { lines } = network.patterns
  const strands: Strand[] = []
  for (const stretch of stretchesOf(network)) {
    for (const ofMode of stretch.lines.values()) {
      const order = [...ofMode.keys()].sort(
        (a, b) =>
          (strandOf(lines[a]) || 0) - (strandOf(lines[b]) || 0) ||
          lines[a].name.localeCompare(lines[b].name),
      )
      order.forEach((line, rank) => {
        const place = rank - (order.length - 1) / 2
        const { along, against } = ofMode.get(line)!
        strands.push(
          along.length > 0
            ? { line: lines[line], segments: along, place }
            : { line: lines[line], segments: against, place: -place || 0 },
        )
      })
    }
  }
  return strands
}
