import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from '@effect/vitest'
import { Clock, Effect, Fiber, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import * as Http from '../rejseplanen/http'
import { apiLayer, readSource } from '../source'
import { fixtureTimetable } from '../testing'
import { loadTimetable } from '../timetable'
import { startingAt } from './clock'
import { replay, savedAnswers } from './freeze'
import {
  callFile,
  readJson,
  readRecorded,
  recordedClient,
  recordingDir,
  RECORDINGS_DIR,
  type Recorded,
} from './layer'
import { RECORDINGS } from './plans'

const timetable = await fixtureTimetable()

/** Every file under a folder, by its path. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}

/** A call to a service through a client, as its status and body. */
const callWith = (client: Http.HttpClient.HttpClient, service: string) =>
  Http.getText(client, `https://www.rejseplan.dk/api/${service}`, {}).pipe(Effect.orDie)

describe('a frozen recording', () => {
  it.effect.each(RECORDINGS.map((plan) => [plan.name, plan] as const))(
    'replays %s through the tracker into the snapshots and route answers it was frozen with',
    ([, plan]) =>
      Effect.gen(function* () {
        const dir = recordingDir(plan.name)
        const replayed = yield* replay(plan, dir)
        const saved = yield* Effect.promise(() =>
          Promise.all(replayed.map((_, i) => readJson(join(dir, 'snapshots', callFile(i))))),
        )
        expect(replayed).toHaveLength(plan.minutes)
        expect(JSON.parse(JSON.stringify(replayed))).toEqual(saved)
        const recorded = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
        const answers = savedAnswers(plan, recorded, replayed)
        expect(answers.size).toBe(
          (plan.answers?.stops.length ?? 0) + (plan.answers?.trips?.length ?? 0),
        )
        for (const [file, answer] of answers) {
          const kept = yield* Effect.promise(() => readJson(join(dir, file)))
          expect(JSON.parse(JSON.stringify(answer))).toEqual(kept)
        }
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
})

describe('the recorded layer', () => {
  const answer = (n: number): Recorded => ({ answer: { n } })

  it.effect("answers each service's calls in order, then repeats the last", () =>
    Effect.gen(function* () {
      const client = recordedClient(
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

  it.effect('answers a failure file with its status and body, and 400 for a service it lacks', () =>
    Effect.gen(function* () {
      const client = recordedClient(
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

  it.effect('hangs a timeout file past any client timeout, then answers 504', () =>
    Effect.gen(function* () {
      const client = recordedClient(new Map([['journeyPos', [{ timeout: true }]]]))
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
    expect(readRecorded({ timeout: true })).toEqual({ timeout: true })
    expect(() => readRecorded({ status: '503' })).toThrow('Not a recorded failure')
    expect(() => readRecorded({ timeout: false })).toThrow('Not a recorded failure')
  })

  it('keeps a recording inside the recordings folder', () => {
    expect(() => recordingDir('../public')).toThrow('lowercase letters, digits and dashes')
    expect(() => recordingDir('Weekday')).toThrow('lowercase letters, digits and dashes')
  })
})

describe("a recording's clock", () => {
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
