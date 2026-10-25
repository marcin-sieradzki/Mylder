// The timetable job: `npm run timetable -- --zip GTFS.zip` prepares the timetable from a
// downloaded Labs GTFS into public/timetable/. docs/timetable.md describes the steps.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { prepareTimetable } from './prepare.ts'

const { values } = parseArgs({
  options: {
    zip: { type: 'string' },
    out: { type: 'string', default: 'public/timetable' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
  },
})

if (!values.zip) {
  console.error(
    'Usage: npm run timetable -- --zip GTFS.zip [--out public/timetable] [--date YYYY-MM-DD]',
  )
  process.exit(2)
}

const sourceHash = createHash('sha256')
  .update(await readFile(values.zip))
  .digest('hex')
const gtfs = await mkdtemp(join(tmpdir(), 'mylder-gtfs-'))
try {
  execFileSync('unzip', ['-q', '-o', values.zip, '-d', gtfs])
  const started = Date.now()
  const manifest = await prepareTimetable({
    gtfs,
    out: values.out,
    sourceHash,
    preparedDate: values.date,
    log: (message) => console.log(message),
  })
  console.log(
    `Prepared ${manifest.version} in ${Math.round((Date.now() - started) / 1000)} s:`,
    JSON.stringify(manifest.counts),
  )
} finally {
  await rm(gtfs, { recursive: true, force: true })
}
