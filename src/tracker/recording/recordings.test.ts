import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from '@effect/vitest'
import { Cause, Clock, Effect, Exit, Fiber, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import * as Http from '../http'
import { RECORDED_REJSEPLANEN } from '../rejseplanen/responses'
import { apiLayer, readSource } from '../source'
import { fixtureTimetable } from '../testing'
import { loadTimetable } from '../timetable'
import { sharedStartingAt, startingAt } from './clock'
import {
  aircraftFile,
  disruptionsFile,
  onTimetable,
  replay,
  replayAircraft,
  savedAnswers,
  withUpdates,
} from './freeze'
import {
  bundledFiles,
  callFile,
  layer,
  readCalls,
  readJson,
  readRecorded,
  isCallFile,
  readStart,
  recordedClient,
  recordingDir,
  RECORDINGS_DIR,
  type Recorded,
  type RecordedApi,
} from './layer'
import { ENDING_TIMETABLE, ON_SIRI_ET, ON_TIMETABLE, RECORDINGS, TIMETABLE_PLANS } from './plans'

const timetable = await fixtureTimetable()

/** Every file under a folder, by its path. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}

/** A call to a service through a client, as its status and body. */
/** An answer's status and body, as the tests compare them. */
const statusAndText = ({ status, text }: Http.Answer) => ({ status, text })

const callWith = (client: Http.HttpClient.HttpClient, service: string) =>
  Http.getText(client, `https://www.rejseplan.dk/api/${service}`, {}).pipe(
    Effect.map(statusAndText),
    Effect.orDie,
  )

/** A recording folder made for one test, holding `files` by their paths, removed after it. */
async function madeRecording<A>(
  files: Record<string, unknown>,
  within: (dir: string) => Promise<A>,
): Promise<A> {
  const dir = await mkdtemp(join(tmpdir(), 'recording-'))
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(dir, path, '..'), { recursive: true })
      await writeFile(join(dir, path), JSON.stringify(content))
    }
    return await within(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('a frozen recording', () => {
  it.effect.each(RECORDINGS.map((plan) => [plan.name, plan] as const))(
    'replays %s through the tracker into the snapshots and route answers it was frozen with',
    ([, plan]) =>
      Effect.gen(function* () {
        const dir = recordingDir(plan.name)
        const { snapshots, disruptions } = yield* replay(plan, dir)
        const saved = (path: (file: string) => string) =>
          Effect.promise(() =>
            Promise.all(snapshots.map((_, i) => readJson(join(dir, path(callFile(i)))))),
          )
        expect(snapshots).toHaveLength(plan.minutes)
        expect(JSON.parse(JSON.stringify(snapshots))).toEqual(
          yield* saved((file) => join('snapshots', file)),
        )
        expect(JSON.parse(JSON.stringify(disruptions))).toEqual(yield* saved(disruptionsFile))
        const recorded = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
        const answers = savedAnswers(plan, recorded, snapshots)
        expect(answers.size).toBe(
          (plan.answers?.stops.length ?? 0) +
            (plan.answers?.arrivals?.length ?? 0) +
            (plan.answers?.trips?.length ?? 0),
        )
        for (const [file, answer] of answers) {
          const kept = yield* Effect.promise(() => readJson(join(dir, file)))
          expect(JSON.parse(JSON.stringify(answer))).toEqual(kept)
        }
      }),
  )

  it.effect(
    'runs the timetable source’s plan again into the snapshots and route answers saved for it',
    () =>
      Effect.gen(function* () {
        const plan = ON_TIMETABLE
        const dir = recordingDir(plan.name)
        const recorded = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
        const { snapshots, disruptions } = yield* onTimetable(plan, recorded)
        const saved = (path: (file: string) => string) =>
          Effect.promise(() =>
            Promise.all(snapshots.map((_, i) => readJson(join(dir, path(callFile(i)))))),
          )
        expect(snapshots).toHaveLength(plan.minutes)
        expect(JSON.parse(JSON.stringify(snapshots))).toEqual(
          yield* saved((file) => join('snapshots', file)),
        )
        expect(JSON.parse(JSON.stringify(disruptions))).toEqual(yield* saved(disruptionsFile))
        const answers = savedAnswers(plan, recorded, snapshots)
        expect([...answers.keys()]).toEqual([
          'answers/stops/27532.json',
          'answers/stops/54307.json',
          'answers/stops/8603313.json',
          'answers/arrivals/27532.json',
          'answers/arrivals/8603313.json',
          'answers/trips/s-tog.A.0bc307e3eb.20260616.0707.json',
          'answers/trips/bus.5C.32331e0e20.20260616.0707.json',
          'answers/trips/metro.M1.7f21f99145.20260616.0707.json',
        ])
        for (const [file, answer] of answers) {
          const kept = yield* Effect.promise(() => readJson(join(dir, file)))
          expect(JSON.parse(JSON.stringify(answer))).toEqual(kept)
          expect(answer?.source).toEqual({ kind: 'timetable' })
        }
        // What the screens get: every trip Timetable only, from a source that made no call, and
        // by the last minute a bus Waiting at Orientkaj St.
        for (const snapshot of snapshots) {
          expect(snapshot).toMatchObject({ source: { kind: 'timetable' }, positionMode: 'none' })
          expect(snapshot.status.calls).toEqual([])
          expect(new Set(snapshot.trips.map((trip) => trip.state))).toEqual(
            new Set(['timetable-only']),
          )
        }
        expect(snapshots.at(-1)!.trips.filter((trip) => trip.waiting)).not.toEqual([])
      }),
  )

  it.effect.each(TIMETABLE_PLANS.map((plan) => [plan.name, plan] as const))(
    'saves %s’s start as its clock, for MYLDER_TIMETABLE_FROM, and its snapshots as the plan runs',
    ([, plan]) =>
      Effect.gen(function* () {
        const dir = recordingDir(plan.name)
        const clock = yield* Effect.promise(() => readJson(join(dir, 'clock.json')))
        expect(clock).toEqual({ start: new Date(plan.start).toISOString() })
        const recorded = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
        const { snapshots } = yield* onTimetable(plan, recorded)
        const saved = yield* Effect.promise(() =>
          Promise.all(snapshots.map((_, i) => readJson(join(dir, 'snapshots', callFile(i))))),
        )
        expect(JSON.parse(JSON.stringify(snapshots))).toEqual(saved)
      }),
  )

  it.effect(
    'runs the timetable source with the SIRI-ET recording’s updates into the snapshots saved for it',
    () =>
      Effect.gen(function* () {
        const plan = ON_SIRI_ET
        const dir = recordingDir(plan.name)
        const recorded = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
        const { snapshots } = yield* withUpdates(plan, recorded)
        const saved = yield* Effect.promise(() =>
          Promise.all(snapshots.map((_, i) => readJson(join(dir, 'snapshots', callFile(i))))),
        )
        expect(snapshots).toHaveLength(plan.minutes)
        expect(JSON.parse(JSON.stringify(snapshots))).toEqual(saved)
        // What the screens get: Estimated trips beside Timetable only ones, from a fresh feed, and
        // bus 102A of 09:04 cancelled whole by the second minute.
        for (const snapshot of snapshots) {
          expect(snapshot).toMatchObject({
            source: { kind: 'timetable' },
            updates: { kind: 'recording', fresh: true },
          })
          expect(new Set(snapshot.trips.map((trip) => trip.state))).toEqual(
            new Set(['estimated', 'timetable-only']),
          )
        }
        const bus102A = (snapshot: (typeof snapshots)[number]) =>
          snapshot.trips.find(
            (trip) => trip.key.startsWith('bus.102A.') && trip.key.endsWith('.0904'),
          )
        expect(bus102A(snapshots[0])?.cancelled).toBeUndefined()
        expect(bus102A(snapshots[1])?.cancelled).toBe(true)
        // And the stop and trip answers of 09:22, each saying when its delays were last updated.
        const answers = savedAnswers(plan, recorded, snapshots)
        expect(answers.size).toBe(7)
        for (const [file, answer] of answers) {
          const kept = yield* Effect.promise(() => readJson(join(dir, file)))
          expect(JSON.parse(JSON.stringify(answer))).toEqual(kept)
          expect(answer?.source).toMatchObject({ kind: 'timetable', delaysUpdated: expect.any(Number) })
        }
      }),
  )

  it.effect('saves the timetable source in its timetable’s last week, the notice’s moment', () =>
    Effect.gen(function* () {
      const dir = recordingDir(ENDING_TIMETABLE.name)
      const recorded = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
      const { snapshots } = yield* onTimetable(ENDING_TIMETABLE, recorded)
      for (const snapshot of snapshots) {
        expect(snapshot).toMatchObject({ source: { kind: 'timetable' }, timetableRunningOut: true })
        expect(snapshot.trips).not.toEqual([])
      }
    }),
  )

  it.effect('replays its aircraft folder into the aircraft snapshots saved beside it', () =>
    Effect.gen(function* () {
      const dir = recordingDir('weekday')
      const snapshots = yield* replayAircraft(dir)
      const saved = yield* Effect.promise(() =>
        Promise.all(snapshots.map((_, i) => readJson(join(dir, aircraftFile(callFile(i)))))),
      )
      expect(snapshots.length).toBeGreaterThanOrEqual(12)
      expect(JSON.parse(JSON.stringify(snapshots))).toEqual(saved)
      // An evening over Copenhagen from one receiver's reach: a handful of planes at a time,
      // and every data state somewhere in the three minutes.
      for (const snapshot of snapshots) expect(snapshot.aircraft.length).toBeGreaterThanOrEqual(5)
      const states = new Set(
        snapshots.flatMap(({ aircraft }) => aircraft.map((each) => each.state)),
      )
      expect([...states].sort()).toEqual(['ageing', 'estimated', 'live', 'no-signal'])
    }),
  )

  it('carries no key in any file', async () => {
    const files = await filesUnder(RECORDINGS_DIR)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      expect({ file, key: /accessId=|REJSEPLANEN_KEY/.test(text) }).toEqual({ file, key: false })
    }
  })

  it('shows the hand-made cases', async () => {
    const first = (name: string) => readJson(join(recordingDir(name), 'journeyPos', '0001.json'))
    expect(await first('empty')).not.toHaveProperty('Journey')
    expect(await first('refused-key')).toMatchObject({
      status: 401,
      body: { errorCode: 'API_AUTH' },
    })
    expect(await first('spent')).toMatchObject({ status: 403, body: { errorCode: 'API_QUOTA' } })
    expect(((await first('cap')) as { Journey: unknown[] }).Journey).toHaveLength(1000)
  })

  it('shows what the aircraft snapshot drops in every weekday aircraft answer', async () => {
    interface Answered {
      hex: string
      lat: number
      lon: number
      type?: string
    }
    const dir = join(recordingDir('weekday'), 'aircraft')
    const files = (await readdir(dir)).filter(isCallFile).sort()
    expect(files.length).toBeGreaterThanOrEqual(12)
    for (const file of files) {
      // Real answers: the planes east of the box, over Øresund and Malmö, and the transponders
      // on Kastrup's apron. PIA, LADD and rough positions are the route tests' hand-made cases.
      const { ac } = (await readJson(join(dir, file))) as { ac: Answered[] }
      expect(ac.some((each) => each.lon > 12.7)).toBe(true)
      expect(ac.some((each) => each.type === 'adsb_icao_nt')).toBe(true)
    }
  })
})

describe('the recorded layer', () => {
  const answer = (n: number): Recorded => ({ answer: { n } })

  it.effect("answers each service's calls in order, then repeats the last", () =>
    Effect.gen(function* () {
      const client = recordedClient(
        RECORDED_REJSEPLANEN,
        new Map([
          ['journeyPos', [answer(1), answer(2)]],
          ['himsearch', [answer(9)]],
        ]),
      )
      const bodies = []
      for (const service of ['journeyPos', 'himsearch', 'journeyPos', 'journeyPos']) {
        bodies.push(JSON.parse((yield* callWith(client, service)).text))
      }
      expect(bodies).toEqual([{ n: 1 }, { n: 9 }, { n: 2 }, { n: 2 }])
    }),
  )

  it.effect("starts each service's calls again from the first once none are left, looping", () =>
    Effect.gen(function* () {
      const client = recordedClient(
        RECORDED_REJSEPLANEN,
        new Map([
          ['journeyPos', [answer(1), answer(2)]],
          ['himsearch', [answer(9)]],
        ]),
        'loop',
      )
      const bodies = []
      for (const service of ['journeyPos', 'himsearch', 'journeyPos', 'journeyPos', 'himsearch']) {
        bodies.push(JSON.parse((yield* callWith(client, service)).text))
      }
      expect(bodies).toEqual([{ n: 1 }, { n: 9 }, { n: 2 }, { n: 1 }, { n: 9 }])
    }),
  )

  it.effect('answers a failure file with its status and body, and 400 for a service it lacks', () =>
    Effect.gen(function* () {
      const client = recordedClient(
        RECORDED_REJSEPLANEN,
        new Map([
          ['journeyPos', [{ status: 503 }]],
          ['himsearch', [{ status: 401, body: { errorCode: 'API_AUTH' } }]],
        ]),
      )
      expect(yield* callWith(client, 'journeyPos')).toEqual({ status: 503, text: '' })
      const refused = yield* callWith(client, 'himsearch')
      expect(refused.status).toBe(401)
      expect(JSON.parse(refused.text)).toEqual({ errorCode: 'API_AUTH' })
      expect((yield* callWith(client, 'journeyDetail')).status).toBe(400)
    }),
  )

  it('answers each stop’s departure board from its own calls, and a stop it has none for as unknown', async () => {
    // A board is asked for a stop's platforms; its calls are kept by them, so opening one stop
    // never takes another's answer, whatever order riders open them in.
    await madeRecording(
      {
        'multiDepartureBoard/8600783/0001.json': { n: 1 },
        'multiDepartureBoard/8600783/0002.json': { n: 2 },
        'multiDepartureBoard/27532+50461/0001.json': { n: 9 },
      },
      async (dir) => {
        const board = (idList: string) =>
          Effect.gen(function* () {
            const client = yield* Http.HttpClient.HttpClient
            return yield* Http.getText(client, 'https://www.rejseplan.dk/api/multiDepartureBoard', {
              idList,
              duration: 30,
            }).pipe(Effect.map(statusAndText), Effect.orDie)
          })
        const answers = await Effect.runPromise(
          Effect.gen(function* () {
            const made = []
            for (const idList of ['27532|50461', '8600783', '8600783', '8600783', '8600626']) {
              made.push(yield* board(idList))
            }
            return made
          }).pipe(Effect.provide(layer(RECORDED_REJSEPLANEN, dir))),
        )
        expect(answers.slice(0, 4).map(({ text }) => JSON.parse(text))).toEqual([
          { n: 9 },
          { n: 1 },
          { n: 2 },
          { n: 2 },
        ])
        expect(answers[4].status).toBe(400)
        expect(JSON.parse(answers[4].text)).toMatchObject({ errorCode: 'SVC_PARAM' })
      },
    )
  })

  it('answers each stop’s arrival board from its own calls, apart from its departure board', async () => {
    await madeRecording(
      {
        'multiDepartureBoard/8600783/0001.json': { departures: true },
        'multiArrivalBoard/8600783/0001.json': { arrivals: true },
      },
      async (dir) => {
        const board = (service: string, idList: string) =>
          Effect.gen(function* () {
            const client = yield* Http.HttpClient.HttpClient
            return yield* Http.getText(client, `https://www.rejseplan.dk/api/${service}`, {
              idList,
              duration: 30,
            }).pipe(Effect.map(statusAndText), Effect.orDie)
          })
        const [arrivals, departures, elsewhere] = await Effect.runPromise(
          Effect.all([
            board('multiArrivalBoard', '8600783'),
            board('multiDepartureBoard', '8600783'),
            board('multiArrivalBoard', '27532|50461'),
          ]).pipe(Effect.provide(layer(RECORDED_REJSEPLANEN, dir))),
        )
        expect(JSON.parse(arrivals.text)).toEqual({ arrivals: true })
        expect(JSON.parse(departures.text)).toEqual({ departures: true })
        expect(elsewhere.status).toBe(400)
        expect(JSON.parse(elsewhere.text)).toMatchObject({ errorCode: 'SVC_PARAM' })
      },
    )
  })

  it.effect('hangs a timeout file past any client timeout, then answers 504', () =>
    Effect.gen(function* () {
      const client = recordedClient(
        RECORDED_REJSEPLANEN,
        new Map([['journeyPos', [{ timeout: true }]]]),
      )
      const fiber = yield* Effect.forkChild(callWith(client, 'journeyPos'))
      yield* Effect.yieldNow
      yield* TestClock.adjust('10 seconds')
      expect(fiber.pollUnsafe()).toBeUndefined()
      yield* TestClock.adjust('30 seconds')
      expect((yield* Fiber.join(fiber)).status).toBe(504)
    }),
  )

  it.effect('is the source for MYLDER_SOURCE=recording:<folder>', () =>
    Effect.gen(function* () {
      const client = yield* Http.HttpClient.HttpClient
      const { text } = yield* callWith(client, 'journeyPos')
      const saved = yield* Effect.promise(() =>
        readJson(join(recordingDir('weekday'), 'journeyPos', '0001.json')),
      )
      expect(JSON.parse(text)).toEqual(saved)
    }).pipe(Effect.provide(apiLayer({ source: readSource('recording:weekday'), timetable }))),
  )

  it('refuses a file shaped like a failure that isn\u2019t one', () => {
    expect(readRecorded({ status: 503 })).toEqual({ status: 503 })
    expect(readRecorded({ status: 429, headers: { 'retry-after': '60' } })).toEqual({
      status: 429,
      headers: { 'retry-after': '60' },
    })
    expect(readRecorded({ timeout: true })).toEqual({ timeout: true })
    expect(() => readRecorded({ status: '503' })).toThrow('Not a recorded failure')
    expect(() => readRecorded({ timeout: false })).toThrow('Not a recorded failure')
    expect(() => readRecorded({ status: 429, headers: { 'retry-after': 60 } })).toThrow(
      'Not a recorded failure',
    )
  })

  it('keeps a recording inside the recordings folder', () => {
    expect(() => recordingDir('../public')).toThrow('lowercase letters, digits and dashes')
    expect(() => recordingDir('Weekday')).toThrow('lowercase letters, digits and dashes')
  })
})

describe('the recorded layer for another API', () => {
  /** A made-up API with one kind of call, named by how its path starts. */
  const radar: RecordedApi = {
    folders: ['aircraft'],
    folderOf: (url) => (url.pathname.startsWith('/v2/point/') ? 'aircraft' : undefined),
    unknown: (request) => Http.text(request, 404, 'Not Found'),
  }

  const call = (path: string) =>
    Effect.gen(function* () {
      const client = yield* Http.HttpClient.HttpClient
      return yield* Http.getText(client, `https://radar.example${path}`, {}).pipe(
        Effect.map(statusAndText),
        Effect.orDie,
      )
    })

  it.effect(
    'replays its folder in call order, failures too, and answers an unknown call its own way',
    () =>
      Effect.gen(function* () {
        const dir = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), 'recording-'))),
          (made) => Effect.promise(() => rm(made, { recursive: true, force: true })),
        )
        const write = (path: string, content: unknown) =>
          Effect.promise(async () => {
            await mkdir(join(dir, path, '..'), { recursive: true })
            await writeFile(join(dir, path), JSON.stringify(content))
          })
        yield* write('aircraft/0001.json', { ac: [{ hex: 'a' }] })
        yield* write('aircraft/0002.json', { status: 503 })
        yield* write('aircraft/0003.json', { ac: [{ hex: 'c' }] })
        // Another API's folder in the same recording is none of this one's.
        yield* write('journeyPos/0001.json', { Journey: [] })
        const answers = yield* Effect.gen(function* () {
          const made = []
          for (let i = 0; i < 4; i++) made.push(yield* call('/v2/point/55.75/12.38/25'))
          made.push(yield* call('/journeyPos'))
          return made
        }).pipe(Effect.provide(layer(radar, dir)))
        expect(answers).toEqual([
          { status: 200, text: JSON.stringify({ ac: [{ hex: 'a' }] }) },
          { status: 503, text: '' },
          { status: 200, text: JSON.stringify({ ac: [{ hex: 'c' }] }) },
          { status: 200, text: JSON.stringify({ ac: [{ hex: 'c' }] }) },
          { status: 404, text: 'Not Found' },
        ])
      }).pipe(Effect.scoped),
  )

  it.effect('fails loudly when its URL rule names a folder it does not list', () =>
    Effect.gen(function* () {
      const misnamed: RecordedApi = { ...radar, folderOf: () => 'planes' }
      const exit = yield* Effect.exit(
        call('/v2/point/55.75/12.38/25').pipe(
          Effect.provideService(Http.HttpClient.HttpClient, recordedClient(misnamed, new Map())),
        ),
      )
      expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain(
        'files /v2/point/55.75/12.38/25 under planes, which is not one of its folders: aircraft',
      )
    }),
  )

  it("fails loudly when a folder can't be read, and reads a missing one as no calls", async () => {
    // A file where the folder should be.
    await madeRecording({ aircraft: { ac: [] } }, async (dir) => {
      await expect(readCalls(radar, dir)).rejects.toThrow('ENOTDIR')
    })
    await madeRecording({}, async (dir) => {
      expect(await readCalls(radar, dir)).toEqual(new Map())
    })
  })

  it('reads only the call files in a folder, not the clock its answers were recorded on', async () => {
    await madeRecording(
      {
        'aircraft/0001.json': { now: 1, ac: [] },
        'aircraft/clock.json': { start: '2026-10-26T18:53:13.500Z' },
      },
      async (dir) => {
        expect(await readCalls(radar, dir)).toEqual(
          new Map([['aircraft', [{ answer: { now: 1, ac: [] } }]]]),
        )
      },
    )
  })

  it('reads a recording bundled by its files’ paths as it reads one from its folder', async () => {
    const dir = '../../recordings/bundled'
    const bundle = {
      [`${dir}/aircraft/0002.json`]: { now: 2, ac: [] },
      [`${dir}/aircraft/0001.json`]: { status: 503 },
      [`${dir}/aircraft/notes.txt`]: 'not a call',
      [`${dir}/aircraft/clock.json`]: { start: '2026-10-26T18:53:13.500Z' },
      [`${dir}/clock.json`]: { start: '2026-06-16T05:20:00.000Z' },
    }
    expect(await readCalls(radar, dir, bundledFiles(bundle))).toEqual(
      new Map([['aircraft', [{ status: 503 }, { answer: { now: 2, ac: [] } }]]]),
    )
    expect(await readCalls(radar, '../../recordings/elsewhere', bundledFiles(bundle))).toEqual(
      new Map(),
    )
  })
})

describe("a recording's clock", () => {
  it.effect('reads the same in every runtime under the recording, whenever each was built', () =>
    Effect.gen(function* () {
      // A moment of its own: the offset is the process's, kept from the first runtime built.
      const start = Date.UTC(2026, 5, 16, 5, 21)
      yield* TestClock.setTime(1_000)
      const tracker = yield* Layer.build(sharedStartingAt(start))
      yield* TestClock.adjust('3 minutes')
      const aircraft = yield* Layer.build(sharedStartingAt(start))
      const now = (built: typeof tracker) => Effect.provide(Clock.currentTimeMillis, built)
      expect([yield* now(tracker), yield* now(aircraft)]).toEqual([
        start + 180_000,
        start + 180_000,
      ])
    }).pipe(Effect.scoped),
  )

  it.effect('reads each start’s own time in runtimes under recordings that start apart', () =>
    Effect.gen(function* () {
      // The transit answers and the aircraft answers, recorded on two days.
      const transit = Date.UTC(2026, 5, 16, 5, 22)
      const aircraft = Date.UTC(2026, 9, 26, 18, 53, 13, 500)
      yield* TestClock.setTime(1_000)
      const tracker = yield* Layer.build(sharedStartingAt(transit))
      yield* TestClock.adjust('3 minutes')
      const overhead = yield* Layer.build(sharedStartingAt(aircraft))
      yield* TestClock.adjust('1 minute')
      const again = yield* Layer.build(sharedStartingAt(transit))
      const now = (built: typeof tracker) => Effect.provide(Clock.currentTimeMillis, built)
      expect([yield* now(tracker), yield* now(overhead), yield* now(again)]).toEqual([
        transit + 240_000,
        aircraft + 60_000,
        transit + 240_000,
      ])
    }).pipe(Effect.scoped),
  )

  it('starts the aircraft answers at their own folder’s moment, or else the recording’s', async () => {
    const recording = { 'clock.json': { start: '2026-06-16T05:20:00.000Z' } }
    await madeRecording(
      { ...recording, 'aircraft/clock.json': { start: '2026-10-26T18:53:13.500Z' } },
      async (dir) => {
        expect(await readStart(dir)).toBe(Date.UTC(2026, 5, 16, 5, 20))
        expect(await readStart(dir, 'aircraft')).toBe(Date.UTC(2026, 9, 26, 18, 53, 13, 500))
      },
    )
    await madeRecording(recording, async (dir) => {
      expect(await readStart(dir, 'aircraft')).toBe(Date.UTC(2026, 5, 16, 5, 20))
    })
  })

  it.effect('starts at the recording’s moment and runs on with the clock beneath', () =>
    Effect.gen(function* () {
      const start = Date.UTC(2026, 5, 16, 5, 20)
      yield* TestClock.setTime(1_000)
      const recorded = yield* Layer.build(startingAt(start))
      const now = Effect.provide(Clock.currentTimeMillis, recorded)
      expect(yield* now).toBe(start)
      yield* TestClock.adjust('5 minutes')
      expect(yield* now).toBe(start + 300_000)
    }).pipe(Effect.scoped),
  )
})
