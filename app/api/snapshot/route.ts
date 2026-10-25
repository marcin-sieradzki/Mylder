import { snapshotResponse } from '../../../src/tracker/routes'

/** The whole-city snapshot every browser polls, cached by the CDN until the next one is due. */
export const GET = () => snapshotResponse()
