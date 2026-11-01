// The update table in the server store (spec #146): where the listener writes it and the tracker
// reads it, one key apart from every source's prefix (`mylder:<source>`), since it serves
// whichever source runs. For now the whole table goes under the one key; how much the listener
// writes each minute is #217's to settle, and only these two functions change with it.
import { Effect, Option, Schema } from 'effect'
import { UpdateTable } from './table.ts'

/** The table's key: not under any source's prefix, which `mylder:updates` never is. */
export const UPDATE_TABLE_KEY = 'mylder:updates:siri-et'

/**
 * How long a written table is kept: a few minutes past the listener's next write, so a dead
 * listener never leaves old delays looking fresh.
 */
export const UPDATE_TABLE_SECONDS = 10 * 60

/** The store's two operations the table needs, as the tracker's store and the listener's have them. */
export interface TableStore {
  /** The value at a key, or undefined when there is none or it has expired. */
  readonly get: (key: string) => Effect.Effect<unknown>
  /** Sets a key's value, kept for `seconds`. */
  readonly set: (key: string, value: unknown, seconds: number) => Effect.Effect<void>
}

/** Writes the table, as the listener does each minute. */
export const writeUpdateTable = (
  store: Pick<TableStore, 'set'>,
  table: UpdateTable,
): Effect.Effect<void> => store.set(UPDATE_TABLE_KEY, table, UPDATE_TABLE_SECONDS)

const decode = Schema.decodeUnknownOption(UpdateTable)

/**
 * The table in the store, as the tracker reads it once a run: undefined when it has expired, or
 * when it fails the schema, such as a table of another version, which is logged.
 */
export const readUpdateTable = (
  store: Pick<TableStore, 'get'>,
): Effect.Effect<UpdateTable | undefined> =>
  Effect.gen(function* () {
    const stored = yield* store.get(UPDATE_TABLE_KEY)
    if (stored === undefined) return undefined
    const table = decode(stored)
    if (Option.isSome(table)) return table.value
    yield* Effect.logWarning(
      `The update table at ${UPDATE_TABLE_KEY} fails its schema (version ${String((stored as { version?: unknown })?.version)}); delays are left out`,
    )
    return undefined
  })
