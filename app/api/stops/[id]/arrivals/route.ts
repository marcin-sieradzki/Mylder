import { stopArrivalsResponse } from '../../../../../src/tracker/routes'

/** A stop's arrivals, from the timetable plus the snapshot's delays; 404 for an unknown stop. */
export async function GET(_: Request, { params }: RouteContext<'/api/stops/[id]/arrivals'>) {
  return stopArrivalsResponse((await params).id)
}
