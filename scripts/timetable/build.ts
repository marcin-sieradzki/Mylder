// The timetable job: `npm run timetable -- --zip GTFS.zip` prepares the timetable from a
// downloaded Labs GTFS into public/timetable/. docs/timetable.md describes the steps.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { TimetableCheckError } from './checks.ts'
import { prepareTimetable } from './prepare.ts'

const { values } = parseArgs({
  options: {
    zip: { type: 'string' },
    out: { type: 'string', default: 'public/timetable' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    force: { type: 'boolean', default: false },
  },
})

if (!values.zip) {
  console.error(
    'Usage: npm run timetable -- --zip GTFS.zip [--out public/timetable] [--date YYYY-MM-DD] [--force]',
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
  const { changed, manifest } = await prepareTimetable({
    gtfs,
    out: values.out,
    sourceHash,
    preparedDate: values.date,
    force: values.force,
    log: (message) => console.log(message),
  })
  if (changed) {
    const seconds = Math.round((Date.now() - started) / 1000)
    console.log(`Prepared ${manifest.version} in ${seconds} s: ${JSON.stringify(manifest.counts)}`)
  } else {
    console.log(`No change: the feed is the one ${manifest.version} was prepared from.`)
  }
} catch (error) {
  if (!(error instanceof TimetableCheckError)) throw error
  console.error(error.message)
  process.exitCode = 1
} finally {
  await rm(gtfs, { recursive: true, force: true })
}
