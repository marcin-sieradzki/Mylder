// The aircraft the snapshot keeps from an answer (docs/aircraft.md, "Kept and dropped"): those
// with a position of their own inside the transit box, its current one or, once that has gone,
// its last. Rough positions from a receiver's own location, ground vehicles, surface categories
// and aircraft whose owners asked not to be shown (PIA, LADD) are dropped. Each kept aircraft
// takes its data state by the domain's rule, and leaves once its position is 5 min old.
import 'server-only'
import { aircraftState, type AircraftStateContext } from '../../domain/aircraft-state.ts'
import { COPENHAGEN_BOX } from '../../timetable/format.ts'
import type { ReadsbAircraft, ReadsbAnswer } from './answers.ts'
import type { SnapshotAircraft } from './snapshot.ts'

/** An aircraft as an answer placed it, before its data state is decided. */
export type Fix = Omit<SnapshotAircraft, 'state'>

/** The feed's database flags for a privacy ICAO address (PIA) and the FAA's LADD list. */
const PIA = 4
const LADD = 8

/** Emitter categories for surface vehicles: emergency, service, and fixed obstacles. */
const SURFACE = new Set(['C1', 'C2', 'C3'])

/** The message type a transponder on the ground, not on an aircraft, sends. */
const GROUND_VEHICLE = 'adsb_icao_nt'

const BROADCAST = new Set(['adsb_icao', 'adsb_other', 'adsr_icao', 'adsr_other', 'adsc'])

/** How a position was found, from the feed's message type. */
export function sourceOf(type: string | undefined): Fix['source'] {
  if (type && BROADCAST.has(type)) return 'broadcast'
  if (type === 'mlat') return 'multilateration'
  if (type?.startsWith('tisb_')) return 'tisb'
  return 'other'
}

/** Seconds to a tenth, as the feed gives them. */
export const tenths = (seconds: number) => Math.round(seconds * 10) / 10

const inBox = (lat: number, lon: number) =>
  lat >= COPENHAGEN_BOX.south &&
  lat <= COPENHAGEN_BOX.north &&
  lon >= COPENHAGEN_BOX.west &&
  lon <= COPENHAGEN_BOX.east

/** The aircraft's own position and its age: its current one, or its last; none for no other. */
function positionOf(aircraft: ReadsbAircraft) {
  const { lat, lon, seen_pos: age, lastPosition } = aircraft
  if (lat !== undefined && lon !== undefined && age !== undefined) return { lat, lon, age }
  if (lastPosition) return { ...lastPosition, age: lastPosition.seen_pos }
  return undefined
}

const shown = (aircraft: ReadsbAircraft) =>
  aircraft.type !== GROUND_VEHICLE &&
  !SURFACE.has(aircraft.category ?? '') &&
  ((aircraft.dbFlags ?? 0) & (PIA | LADD)) === 0

/**
 * The aircraft an answer keeps, by their hexes, each position's age as the feed counted it at the
 * answer's own `now`. The answer comes back within the call's 4 s timeout, and the gap is left
 * out, so a recording's ages are the recorded ones.
 */
export function aircraftIn(answer: ReadsbAnswer): Fix[] {
  const kept: Fix[] = []
  for (const aircraft of answer.ac) {
    const position = positionOf(aircraft)
    if (!position || !inBox(position.lat, position.lon) || !shown(aircraft)) continue
    const callsign = aircraft.flight?.trim()
    kept.push({
      hex: aircraft.hex,
      ...(callsign ? { callsign } : {}),
      ...(aircraft.t ? { type: aircraft.t } : {}),
      lat: position.lat,
      lon: position.lon,
      ...(aircraft.alt_baro === undefined ? {} : { altitude: aircraft.alt_baro }),
      ...(aircraft.gs === undefined ? {} : { speed: aircraft.gs }),
      ...(aircraft.track === undefined ? {} : { track: aircraft.track }),
      age: tenths(position.age),
      source: sourceOf(aircraft.type),
    })
  }
  return kept.sort((a, b) => (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0))
}

/** The same aircraft, `seconds` older: kept from the last answer when a call fails. */
export const aged = (aircraft: readonly Fix[], seconds: number): Fix[] =>
  aircraft.map((each) => ({ ...each, age: tenths(each.age + seconds) }))

/** The aircraft, each with its data state at the snapshot's fetch; none whose position is dropped. */
export function withStates(
  aircraft: readonly Fix[],
  context: AircraftStateContext,
): SnapshotAircraft[] {
  return aircraft.flatMap((each) => {
    const state = aircraftState(each, context)
    return state ? [{ ...each, state }] : []
  })
}
