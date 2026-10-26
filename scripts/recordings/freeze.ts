// Freezes the recordings in `recordings/` from their plans (src/tracker/recording/plans.ts), and
// with them the saved snapshots screen tests use: `npm run recordings`. Each folder is rewritten
// whole: the fixture timetable prepared into `timetable/`, `clock.json`, each service's answers
// in call order, and the tracker's snapshot of every minute in `snapshots/`.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect } from 'effect'
import { fileContent, recordingDir, type RecordingClock } from '../../src/tracker/recording/layer.ts'
import { freeze } from '../../src/tracker/recording/freeze.ts'
import { RECORDINGS } from '../../src/tracker/recording/plans.ts'
import { loadTimetable } from '../../src/tracker/timetable.ts'
import { prepareTimetable } from '../timetable/prepare.ts'
import { FIXTURE, FIXTURE_HASH } from '../timetable/testing.ts'

const numbered = (index: number) => `${String(index + 1).padStart(4, '0')}.json`

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

const only = process.argv.slice(2)
for (const plan of RECORDINGS.filter((each) => only.length === 0 || only.includes(each.name))) {
  const dir = recordingDir(plan.name)
  await rm(dir, { recursive: true, force: true })
  await prepareTimetable({
    gtfs: FIXTURE,
    out: join(dir, 'timetable'),
    sourceHash: FIXTURE_HASH,
    preparedDate: '2026-06-02',
    log: () => {},
  })
  const timetable = await loadTimetable(join(dir, 'timetable'))
  const { calls, snapshots } = await Effect.runPromise(freeze(plan, timetable))
  const clock: RecordingClock = { start: new Date(plan.start).toISOString() }
  await writeJson(join(dir, 'clock.json'), clock)
  for (const [service, recorded] of calls) {
    for (const [i, call] of recorded.entries()) {
      await writeJson(join(dir, service, numbered(i)), fileContent(call))
    }
  }
  for (const [i, snapshot] of snapshots.entries()) {
    await writeJson(join(dir, 'snapshots', numbered(i)), snapshot)
  }
  const answered = [...calls].map(([service, each]) => `${each.length} ${service}`).join(', ')
  console.log(`recordings/${plan.name}: ${answered}, ${snapshots.length} snapshots`)
}
