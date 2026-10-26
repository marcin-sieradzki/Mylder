// What a plane's card says of it (docs/screens.md, "The plane's card"; docs/data-states.md,
// "Aircraft"): its callsign, its type, its altitude and speed in the app's units, and its data
// state's label, aged by the aircraft server's clock from its position's time, `fetched` less its
// `age`. The feed's units are feet and knots; the card's are metres and km/h.
import type { AircraftState } from '../domain/aircraft-state.ts'
import type { ClientDictionary } from '../i18n/dictionary.ts'
import { clockTime } from '../timetable/time.ts'
import type { SnapshotAircraft } from '../tracker/aircraft/index.ts'
import { grouped } from './numbers.ts'
import { ageOf, fill } from './vehicleLabel.ts'

type Words = Pick<ClientDictionary, 'aircraft' | 'vehicle'>

const METRES_PER_FOOT = 0.3048
const KMH_PER_KNOT = 1.852

/** The card's heading: the callsign, or the ICAO hex of a plane that sends none. */
export const aircraftName = (aircraft: SnapshotAircraft): string =>
  aircraft.callsign ?? aircraft.hex

/**
 * The type code, the altitude to the nearest 10 m or "On the ground", and the speed to the km/h,
 * such as "A20N · 3 350 m · 593 km/h": those the feed gave, none where it gave none.
 */
export function aircraftFigures(aircraft: SnapshotAircraft, { aircraft: words }: Words): string {
  const { type, altitude, speed } = aircraft
  return [
    type,
    altitude === 'ground'
      ? words.onGround
      : altitude === undefined
        ? undefined
        : fill(words.altitude, {
            metres: grouped(Math.round((altitude * METRES_PER_FOOT) / 10) * 10),
          }),
    speed === undefined ? undefined : fill(words.speed, { speed: grouped(speed * KMH_PER_KNOT) }),
  ]
    .filter((figure) => figure !== undefined)
    .join(' · ')
}

/**
 * The state's label for `aircraft` in `state` at `now`, from the snapshot fetched at `fetched`:
 * "Reported 4 s ago", "Last seen 40 s ago", "Placed by ground receivers 6 s ago", or "No signal
 * since 15:42" on the clock of `timezone`.
 */
export function aircraftStateLabel(
  aircraft: SnapshotAircraft,
  state: AircraftState,
  fetched: number,
  now: number,
  timezone: string,
  { aircraft: words, vehicle }: Words,
): string {
  const position = fetched - aircraft.age * 1000
  const age = ageOf(position, now, vehicle)
  switch (state) {
    case 'live':
      return fill(vehicle.reported, { age })
    case 'ageing':
      return fill(vehicle.lastSeen, { age })
    case 'estimated':
      return fill(words.placed, { age })
    case 'no-signal':
      return fill(vehicle.noSignalSince, { time: clockTime(position, timezone) })
  }
}
