import { MODES, type Mode, type StopsFile } from '../../src/timetable/format.ts'
import { platformId } from '../../src/timetable/stops.ts'
import type { Feed } from './feed.ts'
import { metresBetween } from './geo.ts'

/** Rows with the same name this close together are one Stop without a transfer link. */
const SAME_PLACE_METRES = 400

/**
 * The name passengers know a row's place by: the feed's name without its bracketed street or
 * mode, so `Nørreport St. (Metro)` and `Nørreport St. (Nørre Voldgade)` are both Nørreport St.
 */
export function placeName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name
}

export interface PreparedStops {
  readonly file: StopsFile
  /** A GTFS stop id's index in `file.platforms`. */
  readonly platformIndex: ReadonlyMap<string, number>
}

/**
 * Groups the feed's stop rows into Stops as places. Two rows are one place when they share a
 * place name and are either close together or linked by one of the feed's transfers. A
 * transfer alone never joins two names: the feed links Nørreport to Nørre Farimagsgade too.
 */
export function buildStops(feed: Feed): PreparedStops {
  const rows = [...feed.stops].sort((a, b) => Number(a.gtfsId) - Number(b.gtfsId))
  const index = new Map(rows.map((row, i) => [row.gtfsId, i]))
  const names = rows.map((row) => placeName(row.name))

  const parent = rows.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const join = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }

  const byName = new Map<string, number[]>()
  names.forEach((name, i) => byName.set(name, [...(byName.get(name) ?? []), i]))
  for (const group of byName.values()) {
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const ra = rows[group[a]]
        const rb = rows[group[b]]
        if (metresBetween(ra.lat, ra.lon, rb.lat, rb.lon) <= SAME_PLACE_METRES) {
          join(group[a], group[b])
        }
      }
    }
  }
  for (const [from, to] of feed.transfers) {
    const a = index.get(from)
    const b = index.get(to)
    if (a !== undefined && b !== undefined && names[a] === names[b]) join(a, b)
  }

  const modes = rows.map(() => new Set<Mode>())
  for (const trip of feed.trips) {
    for (const call of trip.calls) modes[index.get(call.stop.gtfsId)!].add(trip.route.mode)
  }

  // Each group's first row, in id order, names the Stop and gives it its id.
  const stopOf = new Map<number, number>()
  const members: number[][] = []
  rows.forEach((_, i) => {
    const root = find(i)
    let stop = stopOf.get(root)
    if (stop === undefined) {
      stop = members.length
      stopOf.set(root, stop)
      members.push([])
    }
    members[stop].push(i)
  })

  const stops = members.map((group) => {
    const groupModes = new Set(group.flatMap((i) => [...modes[i]]))
    return {
      id: platformId(rows[group[0]].gtfsId),
      name: names[group[0]],
      lat: round(mean(group.map((i) => rows[i].lat))),
      lon: round(mean(group.map((i) => rows[i].lon))),
      modes: MODES.filter((mode) => groupModes.has(mode)),
    }
  })
  const platforms = rows.map((row, i) => ({
    id: platformId(row.gtfsId),
    stop: stopOf.get(find(i))!,
    name: row.name,
    lat: round(row.lat),
    lon: round(row.lon),
  }))

  return { file: { stops, platforms }, platformIndex: index }
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Five decimals is about a metre. */
export function round(degrees: number): number {
  return Math.round(degrees * 1e5) / 1e5
}
