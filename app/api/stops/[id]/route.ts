import { stopResponse } from '../../../../src/tracker/routes'

/** A stop's departures, from the timetable plus the snapshot's delays; 404 for an unknown stop. */
export async function GET(_: Request, { params }: RouteContext<'/api/stops/[id]'>) {
  return stopResponse((await params).id)
}
