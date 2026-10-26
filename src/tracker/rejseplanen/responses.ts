// Rejseplanen's answers as the HTTP door builds them, for every adapter that answers in its place
// (the simulation, the recordings, a missing key, the tests): its error answer, its refusal of a
// call it can't take, and how a recording keeps its calls.
import 'server-only'
import { Schema } from 'effect'
import * as Http from '../http.ts'
import type { RecordedApi } from '../recording/layer.ts'
import { ErrorAnswer, SERVICES, serviceOf } from './answers.ts'

/** Answers a request with Rejseplanen's error answer. */
export const errorAnswer = (
  request: Http.Request,
  status: number,
  errorCode: string,
  errorText: string,
) => Http.json(request, status, Schema.encodeSync(ErrorAnswer)({ errorCode, errorText }))

/** Answers a call to a service or with a parameter Rejseplanen doesn't know, as it does: 400. */
export const svcParam = (request: Http.Request, errorText: string) =>
  errorAnswer(request, 400, 'SVC_PARAM', errorText)

/**
 * Rejseplanen as a recording keeps it: a folder per service, and a call the recording has no
 * answer for refused as an unknown service would be.
 */
export const RECORDED_REJSEPLANEN: RecordedApi = {
  folders: SERVICES,
  folderOf: serviceOf,
  unknown: (request, url) => svcParam(request, `The recording has no ${url.pathname}`),
}
