// Where the aircraft come from, picked by `MYLDER_AIRCRAFT_SOURCE` (docs/testing-seams.md, "The
// switches"): adsb.lol, a recording's `aircraft/` folder, or none. It is independent of
// `MYLDER_SOURCE`, so the planes can be live while transit is simulated.
import 'server-only'
import type { Layer } from 'effect'
import * as Http from '../http.ts'
import * as RecordedHttpClient from '../recording/layer.ts'
import { recordingDir, type RecordedApi } from '../recording/layer.ts'
import type { AircraftProvider } from './snapshot.ts'

export type AircraftSource =
  | { readonly kind: 'adsblol' }
  | { readonly kind: 'recording'; readonly folder: string }
  | { readonly kind: 'off' }

export const AIRCRAFT_SOURCE_VARIABLE = 'MYLDER_AIRCRAFT_SOURCE'

/**
 * Reads `MYLDER_AIRCRAFT_SOURCE`: `adsblol` (the default), `recording:<folder>` or `off`.
 * Anything else is a mistake worth stopping for.
 */
export function readAircraftSource(value: string | undefined): AircraftSource {
  const setting = value?.trim() ?? ''
  if (setting === '' || setting === 'adsblol') return { kind: 'adsblol' }
  if (setting === 'off') return { kind: 'off' }
  const [kind, ...rest] = setting.split(':')
  const folder = rest.join(':')
  if (kind === 'recording' && folder) return { kind: 'recording', folder }
  throw new Error(
    `${AIRCRAFT_SOURCE_VARIABLE}="${setting}" is none of adsblol, recording:<folder> or off`,
  )
}

/** Where adsb.lol answers, and its circle query: 25 nm round 55.75 N, 12.38 E, over the box. */
export const ADSB_LOL_POINT = 'https://api.adsb.lol/v2/point/55.75/12.38/25'

/**
 * The feed as a recording keeps it: one folder, `aircraft/`, for adsb.lol's circle query and
 * adsb.fi's, which answer alike; any other call is not found.
 */
export const RECORDED_AIRCRAFT: RecordedApi = {
  folders: ['aircraft'],
  folderOf: (url) => (/^\/(v2\/point|api\/v3\/lat)\//.test(url.pathname) ? 'aircraft' : undefined),
  unknown: (request) => Http.text(request, 404, 'Not Found'),
}

/** The `HttpClient` layer a source calls the feed through. */
export function feedLayer(
  source: Exclude<AircraftSource, { kind: 'off' }>,
): Layer.Layer<Http.HttpClient.HttpClient> {
  return source.kind === 'recording'
    ? RecordedHttpClient.layer(RECORDED_AIRCRAFT, recordingDir(source.folder))
    : Http.fetchLayer
}

/** The provider a source names in the snapshot. */
export const providerOf = (source: Exclude<AircraftSource, { kind: 'off' }>): AircraftProvider =>
  source.kind === 'recording' ? 'recording' : 'adsb.lol'
