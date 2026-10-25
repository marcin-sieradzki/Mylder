// The simulated `journeyPos`: every trip underway in the box, of the requested products, that
// the position mode carries, up to `maxJny`.
import 'server-only'
import type { LatLon } from '../../domain/trip-motion.ts'
import type { Box } from '../../timetable/format.ts'
import type { JourneyPosAnswer, PositionJourney } from '../rejseplanen/answers.ts'
import {
  envelope,
  journeyName,
  journeyNumberOf,
  journeyRef,
  journeyStops,
  productClass,
  productOf,
  stopLocation,
  trainNumberOf,
} from './journeys.ts'
import { chance } from './random.ts'
import type { SimulationSettings, SimulatedTrip, World } from './world.ts'

/** The most journeys an answer holds, and what `maxJny` is when the request leaves it out. */
export const MAX_JOURNEYS = 1000

/** Reported positions wander up to this far from the path, either way on each axis, in metres. */
export const NOISE = 8

export type PositionMode = 'REPORT_ONLY' | 'CALC_REPORT' | 'CALC'

export interface JourneyPosRequest {
  readonly box: Box
  /** The product classes asked for, as a bitmask. */
  readonly products: number
  readonly positionMode: PositionMode
  readonly maxJny: number
}

/** Reads a request's query as Rejseplanen would, with its defaults. */
export function readJourneyPosRequest(query: URLSearchParams): JourneyPosRequest {
  const number = (name: string, fallback: number) => {
    const value = query.get(name)
    return value === null || value === '' || Number.isNaN(Number(value)) ? fallback : Number(value)
  }
  const mode = query.get('positionMode')
  return {
    box: {
      south: number('llLat', -90),
      west: number('llLon', -180),
      north: number('urLat', 90),
      east: number('urLon', 180),
    },
    products: number('products', 0xffff),
    positionMode: mode === 'CALC_REPORT' || mode === 'CALC' ? mode : 'REPORT_ONLY',
    maxJny: Math.min(Math.max(Math.trunc(number('maxJny', MAX_JOURNEYS)), 1), MAX_JOURNEYS),
  }
}

const inBox = ([lat, lon]: LatLon, box: Box) =>
  lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east

/** A reported position: the point on the path, moved a few metres, the same way all minute. */
function withNoise([lat, lon]: LatLon, key: string, now: number, seed: number): LatLon {
  const minute = Math.floor(now / 60_000)
  const metres = (axis: string) => (chance(seed, key, minute, axis) * 2 - 1) * NOISE
  const perDegree = 111_320
  return [
    lat + metres('lat') / perDegree,
    lon + metres('lon') / (perDegree * Math.cos((lat * Math.PI) / 180)),
  ]
}

function positionJourney(
  settings: SimulationSettings,
  simulated: SimulatedTrip,
  point: LatLon,
): PositionJourney {
  const { timetable, scenario } = settings
  const { trip } = simulated
  const number = journeyNumberOf(timetable, trip)
  const trainNumber = trainNumberOf(trip)
  const product = productOf(trip, number)
  return {
    JourneyDetailRef: { ref: journeyRef(timetable, trip, number) },
    lat: point[0],
    lon: point[1],
    name: journeyName(trip),
    direction: trip.headsign,
    ...(trainNumber ? { trainNumber } : {}),
    trainCategory: product.catIn,
    Product: [product],
    JourneyOrigin: stopLocation(timetable, trip.calls[0].platform),
    JourneyDestination: stopLocation(timetable, trip.calls.at(-1)!.platform),
    ...(scenario.journeyStops ? { Stops: { Stop: nearStops(settings, simulated) } } : {}),
  }
}

/** Calls before and after a journey's position that its stops carry. */
const STOPS_BEHIND = 1
const STOPS_AHEAD = 3

/**
 * The calls a journey carries: the one it left and the next few, which is all the tracker
 * reads, and keeps a city's answer a few hundred kilobytes. Whether Rejseplanen sends these, all
 * of them or none is a first-day fact.
 */
function nearStops({ timetable }: SimulationSettings, { trip, calls, vehicle }: SimulatedTrip) {
  const { stops } = timetable.pathOf(trip.pattern)
  const progress = vehicle?.progress ?? 0
  const next = stops.findIndex((along) => along > progress)
  const ahead = next === -1 ? stops.length : next
  return journeyStops(
    timetable,
    trip,
    calls,
    true,
    Math.max(ahead - STOPS_BEHIND, 0),
    Math.min(ahead + STOPS_AHEAD, trip.calls.length),
  )
}

/** The `journeyPos` answer for a request, from the world at its moment. */
export function journeyPos(
  settings: SimulationSettings,
  world: World,
  request: JourneyPosRequest,
): JourneyPosAnswer {
  const journeys: PositionJourney[] = []
  for (const simulated of world.trips) {
    if (journeys.length === request.maxJny) break
    const { vehicle, trip } = simulated
    // Rejseplanen places journeys that have left; one Waiting at its first stop is the tracker's.
    if (vehicle?.phase !== 'underway' || !inBox(vehicle.point, request.box)) continue
    if ((productClass(trip.line) & request.products) === 0) continue
    const carried = request.positionMode === 'REPORT_ONLY' ? simulated.reports : simulated.carried
    if (!carried) continue
    const reported = simulated.reports && request.positionMode !== 'CALC'
    const point = reported
      ? withNoise(vehicle.point, trip.key, world.now, settings.seed)
      : vehicle.point
    journeys.push(positionJourney(settings, simulated, point))
  }
  const head = envelope(world.now, settings.timetable.manifest.timezone)
  return journeys.length > 0 ? { Journey: journeys, ...head } : head
}
