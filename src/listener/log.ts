// The listener's log: one JSON line each, which the host's log search reads field by field. No
// line ever carries a credential or the token; the loop's test reads every one to make sure.

export interface LogLine {
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
  readonly [field: string]: unknown
}

export type Log = (line: LogLine) => void

/** Writes each line to standard output with the time it was written. */
export const jsonLog: Log = (line) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), ...line }))
