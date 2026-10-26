import { timetableFileResponse } from '../../../../../src/tracker/routes'

/**
 * One of a timetable version's files the browser loads (`manifest`, `stops`, `patterns`,
 * `paths`), kept for good since a version never changes; 404 for the trips or another version.
 */
export async function GET(_: Request, { params }: RouteContext<'/api/timetable/[version]/[file]'>) {
  const { version, file } = await params
  return timetableFileResponse(version, file)
}
