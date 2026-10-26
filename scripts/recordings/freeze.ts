// Freezes the recordings in `recordings/` from their plans (src/tracker/recording/plans.ts), and
// with them the saved snapshots screen tests use: `npm run recordings`. Each folder is rewritten
// whole: the fixture timetable prepared into `timetable/`, `clock.json`, each service's answers
// in call order, the tracker's snapshot of every minute in `snapshots/`, and the stop answers
// the plan saves in `answers/`.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect } from 'effect'
import {
  callFile,
  fileContent,
  recordingDir,
  type RecordingClock,
} from '../../src/tracker/recording/layer.ts'
import { freeze, savedAnswers } from '../../src/tracker/recording/freeze.ts'
import { RECORDINGS } from '../../src/tracker/recording/plans.ts'
import { loadTimetable } from '../../src/tracker/timetable.ts'
import { prepareTimetable } from '../timetable/prepare.ts'
import { FIXTURE, FIXTURE_HASH } from '../timetable/testing.ts'

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
  const answers = savedAnswers(plan, timetable, snapshots)
  const clock: RecordingClock = { start: new Date(plan.start).toISOString() }
  await writeJson(join(dir, 'clock.json'), clock)
  for (const [service, recorded] of calls) {
    for (const [i, call] of recorded.entries()) {
      await writeJson(join(dir, service, callFile(i)), fileContent(call))
    }
  }
  for (const [i, snapshot] of snapshots.entries()) {
    await writeJson(join(dir, 'snapshots', callFile(i)), snapshot)
  }
  for (const [file, answer] of answers) await writeJson(join(dir, file), answer)
  const answered = [...calls].map(([service, each]) => `${each.length} ${service}`).join(', ')
  const saved = answers.size ? `, ${answers.size} stop answers` : ''
  console.log(`recordings/${plan.name}: ${answered}, ${snapshots.length} snapshots${saved}`)
}
