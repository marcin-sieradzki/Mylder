// The frozen fixture timetable (scripts/timetable/fixtures), prepared and held as the tracker
// holds the deployed one, for tracker tests.
import 'server-only'
import { prepareFixture } from '../../scripts/timetable/testing.ts'
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
