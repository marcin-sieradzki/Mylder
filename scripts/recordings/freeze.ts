// Freezes the recordings in `recordings/` from their plans (src/tracker/recording/plans.ts), and
// with them the saved snapshots screen tests use: `npm run recordings`. Each folder is rewritten
// whole: its plan's fixture timetable prepared into `timetable/`, `clock.json`, each service's answers
// in call order, the tracker's snapshot of every minute in `snapshots/`, and in `answers/` its
// disruption list of every minute and the stop answers the plan saves. Its `aircraft/` folder is
// kept as it is, and the aircraft snapshot of each of its calls saved in `answers/aircraft/`. The
// timetable source's plans are saved the same way, with no answers, since that source makes no
// call and they are no recordings to replay; their `clock.json` is the moment
// `MYLDER_TIMETABLE_FROM` starts the timetable source at.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect } from 'effect'
import {
  callFile,
  fileContent,
  recordingDir,
  type RecordingClock,
} from '../../src/tracker/recording/layer.ts'
import {
  aircraftFile,
  disruptionsFile,
  freeze,
  onTimetable,
  replayAircraft,
  savedAnswers,
  UNFROZEN,
  type Served,
} from '../../src/tracker/recording/freeze.ts'
import {
  RECORDINGS,
  TIMETABLE_PLANS,
  type RecordingPlan,
} from '../../src/tracker/recording/plans.ts'
import { loadTimetable, type Timetable } from '../../src/tracker/timetable.ts'
import { prepareTimetable } from '../timetable/prepare.ts'
import { fixtureDir, fixtureHash } from '../timetable/testing.ts'

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Empties a plan's folder but for what is its own, and prepares its fixture timetable in it. */
async function emptied(name: string, fixture = 'gtfs'): Promise<Timetable> {
  const dir = recordingDir(name)
  const entries = await readdir(dir).catch(() => [])
  for (const entry of entries.filter((each) => !UNFROZEN.includes(each))) {
    await rm(join(dir, entry), { recursive: true, force: true })
  }
  await prepareTimetable({
    gtfs: fixtureDir(fixture),
    out: join(dir, 'timetable'),
    sourceHash: await fixtureHash(fixture),
    preparedDate: '2026-06-02',
    log: () => {},
  })
  return loadTimetable(join(dir, 'timetable'))
}

/** Saves what the routes served over a plan: its snapshots, lists and route answers. */
async function saveServed(
  plan: Pick<RecordingPlan, 'name' | 'answers'>,
  timetable: Timetable,
  { snapshots, disruptions }: Served,
): Promise<string> {
  const dir = recordingDir(plan.name)
  const answers = savedAnswers(plan, timetable, snapshots)
  for (const [i, snapshot] of snapshots.entries()) {
    await writeJson(join(dir, 'snapshots', callFile(i)), snapshot)
  }
  for (const [i, list] of disruptions.entries()) {
    await writeJson(join(dir, disruptionsFile(callFile(i))), list)
  }
  for (const [file, answer] of answers) await writeJson(join(dir, file), answer)
  return `${snapshots.length} snapshots` + (answers.size ? `, ${answers.size} route answers` : '')
}

const only = process.argv.slice(2)
const chosen = (name: string) => only.length === 0 || only.includes(name)

for (const plan of RECORDINGS.filter((each) => chosen(each.name))) {
  const dir = recordingDir(plan.name)
  const timetable = await emptied(plan.name, plan.fixture)
  const { calls, ...served } = await Effect.runPromise(freeze(plan, timetable))
  const clock: RecordingClock = { start: new Date(plan.start).toISOString() }
  await writeJson(join(dir, 'clock.json'), clock)
  for (const [service, recorded] of calls) {
    for (const [i, call] of recorded.entries()) {
      await writeJson(join(dir, service, callFile(i)), fileContent(call))
    }
  }
  const saved = await saveServed(plan, timetable, served)
  const aircraft = await Effect.runPromise(replayAircraft(dir))
  for (const [i, snapshot] of aircraft.entries()) {
    await writeJson(join(dir, aircraftFile(callFile(i))), snapshot)
  }
  const answered = [...calls].map(([service, each]) => `${each.length} ${service}`).join(', ')
  const planes = aircraft.length ? `, ${aircraft.length} aircraft snapshots` : ''
  console.log(`recordings/${plan.name}: ${answered}, ${saved}${planes}`)
}

for (const plan of TIMETABLE_PLANS.filter((each) => chosen(each.name))) {
  const timetable = await emptied(plan.name)
  const served = await Effect.runPromise(onTimetable(plan, timetable))
  const clock: RecordingClock = { start: new Date(plan.start).toISOString() }
  await writeJson(join(recordingDir(plan.name), 'clock.json'), clock)
  const saved = await saveServed(plan, timetable, served)
  console.log(`recordings/${plan.name}: no calls on the timetable source, ${saved}`)
}
