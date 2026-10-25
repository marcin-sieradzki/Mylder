// Small checks for the readers: the prepared files are written by the job alone, so a reader
// only needs to fail loudly when it is handed a file of the wrong shape or an older format.

export class TimetableFormatError extends Error {
  override name = 'TimetableFormatError'
}

export function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TimetableFormatError(`${what} is not an object`)
  }
  return value as Record<string, unknown>
}

export function array(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TimetableFormatError(`${what} is not an array`)
  return value
}

export function string(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new TimetableFormatError(`${what} is not a string`)
  return value
}

export function number(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TimetableFormatError(`${what} is not a number`)
  }
  return value
}
