import { tripResponse } from '../../../../src/tracker/routes'

/** A trip's calls, from the timetable plus the snapshot's delay; 404 for an unknown trip. */
export async function GET(_: Request, { params }: RouteContext<'/api/trips/[key]'>) {
  return tripResponse((await params).key)
}
