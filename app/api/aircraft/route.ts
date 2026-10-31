import { aircraftResponse } from '../../../src/tracker/aircraft/routes'

/** The aircraft over Copenhagen, cached by the CDN until the next call to the feed is due. */
export const GET = () => aircraftResponse()
