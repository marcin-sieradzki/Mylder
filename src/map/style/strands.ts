// Where lines share a track, each is drawn as its own strand beside the others, and its vehicles
// ride on it (Perron's map foundation, "Lines and dots"). Which lines share a stretch comes from
// the timetable: the lines of one mode that run between the same two stops. There they keep their
// strands' order, a track spacing apart and centred on the track; a line alone on its track is
// drawn on its centre. Two lines that share track but not stops, such as an express that skips
// some, are not found to share it.
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

/**
 * A line's strand on the full trunk, in track spacings, which orders the lines of a stretch; none
 * for a line without one, which goes beyond those that have one.
 */
export type StrandOf = (line: LineRecord) => number | undefined

/** A line's segments on a stretch, along the stretch's way and against it. */
interface Runs {
  readonly along: Set<number>
  readonly against: Set<number>
}

/** The track between two stops, the stop its way starts from, and each mode's lines on it. */
interface Stretch {
  start?: number
  /** The patterns that run it, in the order they are taken in. */
  readonly patterns: number[]
  /** Whether its patterns have been queued to take their way. */
  reached: boolean
  readonly lines: Map<Mode, Map<number, Runs>>
}

/** A pattern's step from one stop to the next. */
interface Step {
  readonly from: number
  readonly to: number
  readonly stretch: Stretch
  readonly segment: number
}

interface Stretches {
  readonly all: readonly Stretch[]
  /** Each pattern's steps, in calling order; none for a bus route's. */
  readonly steps: readonly (readonly Step[])[]
}

const built = new WeakMap<Network, Stretches>()

/** Text in the order of its code units, the same on every machine whatever its locale. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The stretches the rail lines run, each given one way, so that a pattern runs its stretches
 * along their way or against it, all of them where the patterns allow: a line's strand then
 * stays on one side of the track the whole way, and two lines that share a run never cross. The
 * patterns are taken by direction, line name and key, never in the file's order, so each line
 * keeps its side from one timetable to the next. Where patterns that cross at a junction cannot
 * all agree, a pattern takes the way most of its stretches already have. A bus route is drawn
 * only in focus, alone, so it has no strand.
 */
function stretchesOf(network: Network): Stretches {
  const found = built.get(network)
  if (found) return found
  const { lines, patterns } = network.patterns
  const stopOf = (platform: number) => network.stops.platforms[platform].stop
  const order = patterns
    .map((_, index) => index)
    .filter((index) => lines[patterns[index].line].mode !== 'bus')
    .sort((a, b) => {
      const [p, q] = [patterns[a], patterns[b]]
      return (
        p.direction - q.direction ||
        compare(lines[p.line].name, lines[q.line].name) ||
        compare(p.key, q.key)
      )
    })
  const byStops = new Map<string, Stretch>()
  const steps: Step[][] = patterns.map(() => [])
  for (const index of order) {
    const pattern = patterns[index]
    pattern.segments.forEach((segment, i) => {
      const from = stopOf(pattern.stops[i])
      const to = stopOf(pattern.stops[i + 1])
      const key = from < to ? `${from}-${to}` : `${to}-${from}`
      let stretch = byStops.get(key)
      if (!stretch) byStops.set(key, (stretch = { patterns: [], reached: false, lines: new Map() }))
      steps[index].push({ from, to, stretch, segment })
      stretch.patterns.push(index)
    })
  }

  // Outwards from the first pattern that shares no stretch with one already placed: each pattern
  // takes the way of the stretches placed before it, and gives that way to the rest of its own.
  const placed = new Uint8Array(patterns.length)
  const queue: number[] = []
  for (const seed of order) {
    if (placed[seed] || steps[seed].length === 0) continue
    placed[seed] = 1
    queue.push(seed)
    for (let head = queue.length - 1; head < queue.length; head++) {
      const index = queue[head]
      const { line } = patterns[index]
      let along = 0
      let against = 0
      for (const { from, stretch } of steps[index]) {
        if (stretch.start === undefined) continue
        if (stretch.start === from) along++
        else against++
      }
      const forward = along >= against
      const mode = lines[line].mode
      for (const { from, to, stretch, segment } of steps[index]) {
        stretch.start ??= forward ? from : to
        let ofMode = stretch.lines.get(mode)
        if (!ofMode) stretch.lines.set(mode, (ofMode = new Map()))
        let runs = ofMode.get(line)
        if (!runs) ofMode.set(line, (runs = { along: new Set(), against: new Set() }))
        ;(stretch.start === from ? runs.along : runs.against).add(segment)
        if (stretch.reached) continue
        stretch.reached = true
        for (const next of stretch.patterns) {
          if (placed[next]) continue
          placed[next] = 1
          queue.push(next)
        }
      }
    }
  }
  const stretches = { all: [...byStops.values()], steps }
  built.set(network, stretches)
  return stretches
}

/**
 * Each line's place on a stretch, to the right of its way, in track spacings: its mode's lines in
 * their strands' order, then those without a strand, each by name.
 */
function placesOn(stretch: Stretch, network: Network, strandOf: StrandOf): Map<number, number> {
  const { lines } = network.patterns
  const places = new Map<number, number>()
  for (const ofMode of stretch.lines.values()) {
    const strands = new Map([...ofMode.keys()].map((line) => [line, strandOf(lines[line])]))
    const order = [...ofMode.keys()].sort((a, b) => {
      const [p, q] = [strands.get(a), strands.get(b)]
      const byStrand =
        p === undefined || q === undefined
          ? Number(p === undefined) - Number(q === undefined)
          : p - q
      return byStrand || compare(lines[a].name, lines[b].name)
    })
    order.forEach((line, rank) => places.set(line, rank - (order.length - 1) / 2))
  }
  return places
}

/**
 * Each rail line's strands: on every stretch, the segments it draws there and its place. A line
 * draws a stretch once, along the stretch's way where it runs that way, so its way back is the
 * same strand.
 */
export function strandsOf(network: Network, strandOf: StrandOf): Strand[] {
  const { lines } = network.patterns
  const strands: Strand[] = []
  for (const stretch of stretchesOf(network).all) {
    for (const [line, place] of placesOn(stretch, network, strandOf)) {
      const { along, against } = stretch.lines.get(lines[line].mode)!.get(line)!
      strands.push(
        along.size > 0
          ? { line: lines[line], segments: [...along], place }
          : { line: lines[line], segments: [...against], place: -place || 0 },
      )
    }
  }
  return strands
}

/**
 * Each pattern's place on each of its steps, in track spacings to the right of the way it runs,
 * on the same strand its line is drawn on there; none for a bus route's.
 */
export function patternPlaces(
  network: Network,
  strandOf: StrandOf,
): readonly (readonly number[] | undefined)[] {
  const { all, steps } = stretchesOf(network)
  const places = new Map(all.map((stretch) => [stretch, placesOn(stretch, network, strandOf)]))
  return network.patterns.patterns.map((pattern, index) => {
    if (steps[index].length === 0) return undefined
    return steps[index].map(({ from, stretch }) => {
      const place = places.get(stretch)!.get(pattern.line)!
      return (stretch.start === from ? place : -place) || 0
    })
  })
}
