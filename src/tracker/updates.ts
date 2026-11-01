// Where the tracker's updates come from, picked by `MYLDER_UPDATES` at request time
// (docs/testing-seams.md, "The update switch"), apart from `MYLDER_SOURCE`, so delays work on the
// timetable source now and on Rejseplanen's later (spec #146): off (the default), SIRI-ET's update
// table as the listener keeps it in the store, or the SIRI-ET reader run inside the tracker over a
// recording's messages.
import 'server-only'

/** Where updates come from: none, the listener's table in the store, or a recording's messages. */
export type Updates =
  | { readonly kind: 'off' }
  | { readonly kind: 'siri' }
  | { readonly kind: 'recording'; readonly folder: string }

/** The variable that picks where updates come from. */
export const UPDATES_VARIABLE = 'MYLDER_UPDATES'

const OFF: Updates = { kind: 'off' }

/**
 * Reads `MYLDER_UPDATES`: `off` (the default, when it is unset or empty, so local runs and tests
 * need no listener), `siri` or `recording:<folder>`. Anything else is a mistake worth stopping for.
 */
export function readUpdates(value: string | undefined): Updates {
  const setting = value?.trim() ?? ''
  if (setting === '' || setting === 'off') return OFF
  if (setting === 'siri') return { kind: 'siri' }
  const [kind, ...rest] = setting.split(':')
  const folder = rest.join(':')
  if (kind === 'recording' && folder) return { kind: 'recording', folder }
  throw new Error(`${UPDATES_VARIABLE}="${setting}" is none of off, siri or recording:<folder>`)
}

/** The variable's value as it was set, for a log line. */
export const updatesSetting = (updates: Updates): string =>
  updates.kind === 'recording' ? `recording:${updates.folder}` : updates.kind
