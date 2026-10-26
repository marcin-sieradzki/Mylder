import { disruptionsResponse } from '../../../src/tracker/routes'

/** The disruption list, cached by the CDN until the tracker next fetches it. */
export const GET = () => disruptionsResponse()
