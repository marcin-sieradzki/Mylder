// Replays a whole SIRI-ET recording into the reader and prints the update table's figures each
// five minutes: journeys held and listed, steps, cancellations and the table's size as JSON and
// gzipped. The figures in docs/live-data.md ("SIRI-ET", "The update table") come from it. The
// reader's tests replay a sample instead, since the whole recording takes seconds.
// Usage: node --conditions=react-server scripts/siri-et/replay-siri-et.ts [recordingDir]
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { siriEtReader } from '../../src/tracker/siri-et/reader.ts'
import { readBox, readSiriEtMessages } from '../../src/tracker/siri-et/recording.ts'

const dir = process.argv[2] ?? join(process.cwd(), 'recordings', 'siri-et')
const messages = await readSiriEtMessages(join(dir, 'messages.jsonl.gz'))
const box = await readBox(join(dir, 'timetable'))
const reader = siriEtReader({ box, listener: { version: 'replay', startedAt: 0 } })

const FIVE_MINUTES = 5 * 60_000
const rows: Record<string, string | number>[] = []
let next = Math.ceil(messages[0].receivedAt / FIVE_MINUTES) * FIVE_MINUTES
const started = performance.now()
const describe = (now: number) => {
  const table = reader.table(now)
  const json = JSON.stringify(table)
  rows.push({
    at: new Date(now).toISOString().slice(11, 16) + 'Z',
    held: table.held,
    listed: table.journeys.length,
    steps: table.journeys.reduce((n, j) => n + j.steps.length, 0),
    cancelled: table.journeys.filter((j) => j.cancelled).length,
    cancelledCalls: table.journeys.reduce((n, j) => n + (j.cancelledCalls?.length ?? 0), 0),
    kB: Math.round(json.length / 1000),
    gzippedKB: Math.round(gzipSync(json).length / 1000),
  })
  return table
}
for (const message of messages) {
  for (; message.receivedAt >= next; next += FIVE_MINUTES) describe(next)
  reader.receive(message)
}
const last = describe(messages[messages.length - 1].receivedAt)
console.log(`${messages.length} messages in ${Math.round(performance.now() - started)} ms`)
console.table(rows)
console.table(last.datasets)
