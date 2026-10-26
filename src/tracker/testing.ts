// The frozen fixture timetable (scripts/timetable/fixtures), prepared and held as the tracker
// holds the deployed one, for tracker tests.
import 'server-only'
import { prepareFixture } from '../../scripts/timetable/testing.ts'
import type { IsoDate } from '../timetable/format.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import { timetableFrom, type Timetable } from './timetable.ts'

let prepared: Promise<Timetable> | undefined

export function fixtureTimetable(): Promise<Timetable> {
  prepared ??= prepareFixture().then(({ manifest, read }) =>
    timetableFrom({
      manifest,
      stops: read(manifest.files.stops),
      patterns: read(manifest.files.patterns),
      paths: read(manifest.files.paths),
      trips: read(manifest.files.trips),
    }),
  )
  return prepared
}

/**
 * A timetable whose service day `day` starts at midnight, as night buses do: that day's trips
 * moved earlier by `hours`, their keys kept. The fixture's days start at 07:00.
 */
export function startingAtMidnight(timetable: Timetable, day: IsoDate, hours = 7): Timetable {
  const shift = hours * 3600_000
  let moved: readonly PlannedTrip[] | undefined
  return {
    ...timetable,
    tripsOn(each) {
      if (each !== day) return timetable.tripsOn(each)
      moved ??= timetable.tripsOn(day).map((trip) => ({
        ...trip,
        calls: trip.calls.map((call) => ({
          ...call,
          arrival: call.arrival - shift,
          departure: call.departure - shift,
        })),
      }))
      return moved
    },
  }
}
