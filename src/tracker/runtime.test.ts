import { Effect, ManagedRuntime } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { timetableManifestResponse } from './routes'
import { environmentLayer, timetableDirOf } from './runtime'
import { readSource } from './source'
import { TIMETABLE_DIR } from './timetable'
import { Tracker } from './tracker'

// The runtime as the environment sets it up, as the verifier launches it: the timetable source
// on a saved folder's timetable and clock, so a moment such as a timetable's last week can be
// driven again (docs/testing-seams.md, "The switch").

/** The snapshot of a runtime built from `env`, on the real clock beneath it. */
async function snapshotOn(env: Record<string, string>) {
  const runtime = ManagedRuntime.make(await environmentLayer(env))
  try {
    return await runtime.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Tracker).getSnapshot
      }),
    )
  } finally {
    await runtime.dispose()
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the default source', () => {
  it('is the timetable when MYLDER_SOURCE is unset or empty: no call, nothing simulated', async () => {
    for (const env of [{}, { MYLDER_SOURCE: '' }] as Record<string, string>[]) {
      const snapshot = await snapshotOn(env)
      expect(snapshot.source).toEqual({ kind: 'timetable' })
      expect(snapshot.positionMode).toBe('none')
      expect(snapshot.status.calls).toEqual([])
      expect(snapshot.budget).toMatchObject({ calls: 0 })
    }
  })
})

describe('the timetable source on a saved folder', () => {
  it('runs on the folder’s timetable from its clock, in the timetable’s last week', async () => {
    const snapshot = await snapshotOn({
      MYLDER_SOURCE: 'timetable',
      MYLDER_TIMETABLE_FROM: 'timetable-ending',
    })
    expect(snapshot.source).toEqual({ kind: 'timetable' })
    expect(snapshot.status.calls).toEqual([])
    expect(snapshot.serviceDay).toBe('2026-08-25')
    expect(snapshot.timetableVersion).toBe('2026-06-02-4f2b8119')
    expect(snapshot.timetableRunningOut).toBe(true)
    expect(snapshot.status.timetable).toMatchObject({ last: '2026-08-26' })
    expect(snapshot.trips.length).toBeGreaterThan(0)
    expect(new Set(snapshot.trips.map((trip) => trip.state))).toEqual(new Set(['timetable-only']))
  })

  it('serves the browser the folder’s timetable files', async () => {
    vi.stubEnv('MYLDER_SOURCE', 'timetable')
    vi.stubEnv('MYLDER_TIMETABLE_FROM', 'timetable-ending')
    const manifest = (await (await timetableManifestResponse()).json()) as { version: string }
    expect(manifest.version).toBe('2026-06-02-4f2b8119')
  })

  it('is ignored by every other source, and the timetable source alone runs on the deployed one', async () => {
    const recorded = await snapshotOn({
      MYLDER_SOURCE: 'recording:weekday',
      MYLDER_TIMETABLE_FROM: 'timetable-ending',
    })
    expect(recorded.serviceDay).toBe('2026-06-16')
    // Without it, as in production, the timetable source reads the deployed timetable.
    expect(timetableDirOf(readSource('timetable'), undefined)).toBe(TIMETABLE_DIR)
    expect(timetableDirOf(readSource('timetable'), ' ')).toBe(TIMETABLE_DIR)
    expect(timetableDirOf(readSource('simulated'), 'timetable-ending')).toBe(TIMETABLE_DIR)
  })
})

describe('updates from a SIRI-ET recording, MYLDER_UPDATES=recording:<folder>', () => {
  it('runs the reader over the folder’s messages at its clock, on its timetable, beside the timetable source', async () => {
    const snapshot = await snapshotOn({ MYLDER_UPDATES: 'recording:siri-et' })
    expect(snapshot.source).toEqual({ kind: 'timetable' })
    expect(snapshot.serviceDay).toBe('2026-10-31')
    expect(snapshot.timetableVersion).toBe('2026-11-01-6495dcc6')
    expect(snapshot.updates).toMatchObject({ kind: 'recording' })
    // The recording's clock starts at its first message and runs on, so its table holds the
    // messages of its first seconds.
    const start = Date.parse('2026-10-31T08:00:03.761Z')
    expect(snapshot.updates.lastMessage).toBeGreaterThanOrEqual(start)
    expect(snapshot.updates.lastMessage).toBeLessThan(start + 60_000)
  })

  it('starts at a saved moment’s clock, recording:<folder>/<moment>, a few minutes before the messages end', async () => {
    // recordings/siri-et/quiet/clock.json: 09:55:00, 67 s before the last message, at 09:56:07,
    // so the feed is fresh at first and quiet 5 min after that message.
    const snapshot = await snapshotOn({ MYLDER_UPDATES: 'recording:siri-et/quiet' })
    expect(snapshot.serviceDay).toBe('2026-10-31')
    expect(snapshot.fetched).toBeGreaterThanOrEqual(Date.parse('2026-10-31T08:55:00Z'))
    expect(snapshot.fetched).toBeLessThan(Date.parse('2026-10-31T08:56:00Z'))
    expect(snapshot.updates).toMatchObject({ kind: 'recording', fresh: true })
    expect(snapshot.updates.withUpdate.bus).toBeGreaterThan(100)
  }, 30_000)

  it('refuses a saved moment that isn’t there', async () => {
    await expect(environmentLayer({ MYLDER_UPDATES: 'recording:siri-et/never' })).rejects.toThrow(
      /siri-et.never.clock\.json/,
    )
  })

  it('serves the browser the folder’s timetable files', async () => {
    vi.stubEnv('MYLDER_UPDATES', 'recording:siri-et')
    const manifest = (await (await timetableManifestResponse()).json()) as { version: string }
    expect(manifest.version).toBe('2026-11-01-6495dcc6')
  })

  it('is ignored, and logged, where the source runs at another clock than the recording’s', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const recorded = await snapshotOn({
        MYLDER_SOURCE: 'recording:weekday',
        MYLDER_UPDATES: 'recording:siri-et',
      })
      expect(recorded.serviceDay).toBe('2026-06-16')
      expect(recorded.updates.kind).toBe('off')
      const ending = await snapshotOn({
        MYLDER_TIMETABLE_FROM: 'timetable-ending',
        MYLDER_UPDATES: 'recording:siri-et',
      })
      expect(ending.serviceDay).toBe('2026-08-25')
      expect(ending.updates.kind).toBe('off')
      const lines = logged.mock.calls.map((call) => call.map(String).join(' '))
      expect(lines.filter((line) => line.includes('is ignored under'))).toHaveLength(2)
    } finally {
      logged.mockRestore()
    }
  })

  it('is ignored under the simulation, whose snapshot names updates off', async () => {
    const snapshot = await snapshotOn({ MYLDER_SOURCE: 'simulated', MYLDER_UPDATES: 'siri' })
    expect(snapshot.updates.kind).toBe('off')
  })
})
