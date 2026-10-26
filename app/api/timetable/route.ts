import { timetableManifestResponse } from '../../../src/tracker/routes'

/** The current timetable's manifest, which the map starts from; kept for a minute. */
export const GET = () => timetableManifestResponse()
