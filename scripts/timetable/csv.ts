import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { createInterface } from 'node:readline'

/**
 * Reads a GTFS table row by row, handing `onRow` the values of `columns` in that order. A
 * column the file lacks reads as an empty string. Streams the file, so `stop_times.txt`'s five
 * million rows never sit in memory as text. Returns the number of rows.
 */
export async function forEachRow(
  path: string,
  columns: readonly string[],
  onRow: (values: string[]) => void,
): Promise<number> {
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  let indexes: number[] | undefined
  let rows = 0
  for await (const line of lines) {
    if (indexes === undefined) {
      const header = parseLine(line.replace(/^\uFEFF/, ''))
      indexes = columns.map((column) => header.indexOf(column))
      continue
    }
    if (line === '') continue
    const fields = parseLine(line)
    onRow(indexes.map((i) => (i < 0 ? '' : (fields[i] ?? ''))))
    rows++
  }
  return rows
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Splits one CSV line, unquoting fields; Labs quotes some fields and not others. */
export function parseLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',')
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      fields.push(field)
      field = ''
    } else {
      field += c
    }
  }
  fields.push(field)
  return fields
}
