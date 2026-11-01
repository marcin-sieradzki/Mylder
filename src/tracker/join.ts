// The join (docs/timetable.md, "The join"): each journey in a `journeyPos` answer to a trip of
// its service day. The API has no GTFS trip id, so the journey's reference does the work: its
// line, first stop and departure, last stop and arrival, and its day; the direction settles the
// rare trips those leave alike. A trip's `journeyDetail`, when a viewer opens it, can correct a
// wrong first guess (`trip-detail.ts`); the correction is kept and the join takes it from then on.
import 'server-only'
import type { IsoDate } from '../timetable/format.ts'
import { platformId } from '../timetable/stops.ts'
import { serviceDayStart } from '../timetable/time.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import type { PositionJourney } from './rejseplanen/answers.ts'
import type { Timetable } from './timetable.ts'

/** What a journey reference says about its trip. */
export interface JourneyRef {
  readonly line: string
  readonly first: string
  /** The first departure as the reference writes it: minutes past the service day's start as `HMM`. */
  readonly firstTime: number
  readonly last?: string
  readonly lastTime?: number
  readonly day: IsoDate
  /** Rejseplanen's own journey number and day, `ZI@DA`, which the snapshot carries along. */
  readonly journey: string
}

/** Reads a reference's `#`-separated fields, or undefined when it lacks one the join needs. */
export function readRef(ref: string): JourneyRef | undefined {
  const parts = ref.split('#')
  const field = (name: string) => {
    const i = parts.indexOf(name)
    return i > 0 && i + 1 < parts.length ? parts[i + 1] : undefined
  }
  const [line, first, firstTime, da, zi] = ['ZE', 'FR', 'FT', 'DA', 'ZI'].map(field)
  if (!line || !first || !firstTime || !da || !/^\d{5,6}$/.test(da)) return undefined
  const day = `20${da.slice(-2)}-${da.slice(-4, -2)}-${da.slice(0, -4).padStart(2, '0')}`
  const last = field('TO')
  const lastTime = field('TT')
  return {
    line,
    first: platformId(first),
    firstTime: Number(firstTime),
    ...(last ? { last: platformId(last) } : {}),
    ...(lastTime ? { lastTime: Number(lastTime) } : {}),
    day,
    journey: `${zi ?? ''}@${da}`,
  }
}

/** A moment as minutes past a service day's start, written `HMM` the way references do. */
function referenceTime(start: number, moment: number): number {
  const minutes = Math.round((moment - start) / 60_000)
  return Math.floor(minutes / 60) * 100 + (minutes % 60)
}

type Index = ReadonlyMap<string, readonly PlannedTrip[]>

const indexes = new WeakMap<Timetable, Map<IsoDate, Index>>()

const keyOf = (line: string, first: string, firstTime: number) => `${line}|${first}|${firstTime}`

/** The Stop a platform id belongs to, by the Stop's id: references may name any of its platforms. */
const stopOf = (timetable: Timetable, id: string) => timetable.stops.stopForPlatform(id)?.id ?? id

/** A service day's trips by line, first stop and first departure, built once per day. */
function indexOf(timetable: Timetable, day: IsoDate): Index {
  let days = indexes.get(timetable)
  if (!days) indexes.set(timetable, (days = new Map()))
  let index = days.get(day)
  if (!index) {
    const start = serviceDayStart(day, timetable.manifest.timezone)
    const { platforms, stops } = timetable.stops
    const built = new Map<string, PlannedTrip[]>()
    for (const trip of timetable.tripsOn(day)) {
      const key = keyOf(
        trip.line.name,
        stops[platforms[trip.calls[0].platform].stop].id,
        referenceTime(start, trip.calls[0].departure),
      )
      built.set(key, [...(built.get(key) ?? []), trip])
    }
    days.set(day, (index = built))
  }
  return index
}

/** A service day's trips by key, built once per day. */
const byKeys = new WeakMap<Timetable, Map<IsoDate, ReadonlyMap<string, PlannedTrip>>>()

/** A trip of a service day by its key. */
export function tripOn(timetable: Timetable, day: IsoDate, key: string): PlannedTrip | undefined {
  let days = byKeys.get(timetable)
  if (!days) byKeys.set(timetable, (days = new Map()))
  let trips = days.get(day)
  if (!trips) days.set(day, (trips = new Map(timetable.tripsOn(day).map((t) => [t.key, t]))))
  return trips.get(key)
}

/**
 * The join's corrections: by Rejseplanen's journey (`ZI@DA`), the trip a `journeyDetail` showed
 * it to be where the first guess was another.
 */
export type Corrections = Readonly<Record<string, string>>

/** What the join reads from a journey: its reference and direction, as positions and boards give them. */
export type Joinable = Pick<PositionJourney, 'JourneyDetailRef' | 'direction'>

/**
 * The trip a journey is, or undefined when no trip of its day fits: an unmatched journey. Trips
 * alike in line, first stop and departure are told apart by the last stop, its arrival and the
 * direction; exact duplicates (`.2`) go to journeys in turn, so `taken` holds the keys an answer
 * has already joined. A journey with a correction is the trip it names, while that is free.
 */
export function joinJourney(
  timetable: Timetable,
  journey: Joinable,
  taken: { has(key: string): boolean } = new Set<string>(),
  corrections: Corrections = {},
): { trip: PlannedTrip; ref: JourneyRef } | undefined {
  const ref = readRef(journey.JourneyDetailRef.ref)
  if (!ref) return undefined
  const corrected = corrections[ref.journey]
  if (corrected !== undefined && !taken.has(corrected)) {
    const trip = tripOn(timetable, ref.day, corrected)
    if (trip) return { trip, ref }
  }
  const first = stopOf(timetable, ref.first)
  const candidates = indexOf(timetable, ref.day).get(keyOf(ref.line, first, ref.firstTime)) ?? []
  const { platforms, stops } = timetable.stops
  const start = serviceDayStart(ref.day, timetable.manifest.timezone)
  const last = ref.last === undefined ? undefined : stopOf(timetable, ref.last)
  const fit = candidates.find((trip) => {
    if (taken.has(trip.key)) return false
    if (candidates.length === 1) return true
    const end = trip.calls.at(-1)!
    return (
      (last === undefined || stops[platforms[end.platform].stop].id === last) &&
      (ref.lastTime === undefined || referenceTime(start, end.arrival) === ref.lastTime) &&
      (journey.direction === undefined || trip.headsign === journey.direction)
    )
  })
  return fit ? { trip: fit, ref } : undefined
}

/**
 * SIRI-ET's join (spec #146, docs/timetable.md "The join"): each journey of the update table to a
 * trip of its service day. A message carries only some of a journey's calls, often not its first,
 * so the join can't key on the first departure as a reference does. A train is found by its train
 * number, which SIRI-ET's `TrainNumberRef` gives without the timetable's leading zeros; any other
 * journey by its line and its first and last stops, then by a call it holds, at a stop of the
 * trip's pattern at that call's planned time. No Metro or light rail trip is joined: SIRI-ET has no
 * dataset for either, so they stay Timetable only (ADR 0006) whatever a journey claims.
 */
export interface TableJoinable {
  readonly day: string
  readonly line: string
  readonly origin: string
  readonly destination: string
  readonly trainNumber?: string
  /** The calls the journey holds: its first, its delays' and its cancelled ones. */
  readonly calls: readonly { readonly stop: string; readonly aimed: number }[]
}

interface TableIndex {
  /** Train and S-tog trips by their train number, without leading zeros. */
  readonly byNumber: ReadonlyMap<string, readonly PlannedTrip[]>
  /** Trips by line and first and last Stop. */
  readonly byEnds: ReadonlyMap<string, readonly PlannedTrip[]>
}

const tableIndexes = new WeakMap<Timetable, Map<IsoDate, TableIndex>>()

const endsKey = (line: string, first: string, last: string) => `${line}|${first}|${last}`

/** The modes SIRI-ET carries no journeys of, whose trips the join leaves alone. */
const NOT_IN_SIRI_ET: ReadonlySet<string> = new Set(['metro', 'light-rail'])

/** A service day's trips by train number and by their ends, built once per day. */
function tableIndexOf(timetable: Timetable, day: IsoDate): TableIndex {
  let days = tableIndexes.get(timetable)
  if (!days) tableIndexes.set(timetable, (days = new Map()))
  let index = days.get(day)
  if (!index) {
    const { platforms, stops } = timetable.stops
    const stopAt = (call: PlannedTrip['calls'][number]) => stops[platforms[call.platform].stop].id
    const byNumber = new Map<string, PlannedTrip[]>()
    const byEnds = new Map<string, PlannedTrip[]>()
    const add = (map: Map<string, PlannedTrip[]>, key: string, trip: PlannedTrip) =>
      map.set(key, [...(map.get(key) ?? []), trip])
    for (const trip of timetable.tripsOn(day)) {
      const { mode, name } = trip.line
      if (NOT_IN_SIRI_ET.has(mode)) continue
      if (trip.number && (mode === 'train' || mode === 's-tog')) {
        add(byNumber, platformId(trip.number), trip)
      }
      add(byEnds, endsKey(name, stopAt(trip.calls[0]), stopAt(trip.calls.at(-1)!)), trip)
    }
    days.set(day, (index = { byNumber, byEnds }))
  }
  return index
}

/** Whether a trip's call is at a SIRI-ET stop ref, its platform's or its Stop's. */
function atStop(timetable: Timetable, call: PlannedTrip['calls'][number], ref: string): boolean {
  const { platforms, stops } = timetable.stops
  const platform = platforms[call.platform]
  return (
    platformId(platform.id) === platformId(ref) ||
    stops[platform.stop].id === stopOf(timetable, platformId(ref))
  )
}

/**
 * The index of a trip's call at a SIRI-ET call, from `from` on: at its stop, planned to leave (or
 * arrive, at a call it doesn't leave) at its aimed time. -1 when the trip has no such call.
 */
export function callIndexOf(
  timetable: Timetable,
  trip: PlannedTrip,
  call: { readonly stop: string; readonly aimed: number },
  from = 0,
): number {
  return trip.calls.findIndex(
    (each, i) =>
      i >= from &&
      (each.departure === call.aimed || each.arrival === call.aimed) &&
      atStop(timetable, each, call.stop),
  )
}

/**
 * The trip a SIRI-ET journey is, or undefined when no trip of its day fits: an unmatched journey.
 * `taken` holds the keys the table's other journeys have already joined.
 */
export function joinTableJourney(
  timetable: Timetable,
  journey: TableJoinable,
  taken: { has(key: string): boolean } = new Set<string>(),
): PlannedTrip | undefined {
  const index = tableIndexOf(timetable, journey.day)
  const free = (trip: PlannedTrip) => !taken.has(trip.key)
  if (journey.trainNumber) {
    const number = platformId(journey.trainNumber)
    // DSB's line is the train number itself; the S-tog's and Lokaltog's is the line's name.
    const train = index.byNumber
      .get(number)
      ?.find((trip) => free(trip) && (trip.line.name === journey.line || journey.line === number))
    if (train) return train
  }
  const ends = endsKey(
    journey.line,
    stopOf(timetable, platformId(journey.origin)),
    stopOf(timetable, platformId(journey.destination)),
  )
  return index.byEnds
    .get(ends)
    ?.find(
      (trip) => free(trip) && journey.calls.some((call) => callIndexOf(timetable, trip, call) >= 0),
    )
}
