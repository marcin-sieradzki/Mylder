import { describe, expect, it } from '@effect/vitest'
import { Cause, Effect, Exit, Logger } from 'effect'
import * as Http from './http'
import { apiLayer, readSource, updatesFor } from './source'
import { fixtureTimetable } from './testing'
import { readUpdates } from './updates'

const timetable = await fixtureTimetable()

describe('the timetable source in the switch', () => {
  it('reads MYLDER_SOURCE=timetable as the timetable source', () => {
    expect(readSource('timetable')).toEqual({ kind: 'timetable' })
    expect(readSource(' timetable ')).toEqual({ kind: 'timetable' })
  })

  it('reads unset, empty and blank as the timetable source, the default', () => {
    expect(readSource(undefined)).toEqual({ kind: 'timetable' })
    expect(readSource('')).toEqual({ kind: 'timetable' })
    expect(readSource('  ')).toEqual({ kind: 'timetable' })
  })

  it('still reads simulated as the simulation, which is never the default', () => {
    expect(readSource('simulated')).toEqual({ kind: 'simulated', scenario: 'weekday' })
    expect(readSource('simulated:patchy')).toEqual({ kind: 'simulated', scenario: 'patchy' })
  })

  it('lists timetable among the choices when a setting is unknown', () => {
    expect(() => readSource('live')).toThrow(/timetable/)
    expect(() => readSource('timetable:weekday')).toThrow(/MYLDER_SOURCE="timetable:weekday"/)
  })
})

describe('the timetable source’s API layer', () => {
  it.effect('refuses every call, logging an error that names the source', () => {
    const logged: { level: string; message: string }[] = []
    return Effect.gen(function* () {
      const client = yield* Http.HttpClient.HttpClient
      for (const service of ['journeyPos', 'himsearch', 'multiDepartureBoard', 'journeyDetail']) {
        const exit = yield* Effect.exit(
          Http.getText(client, `https://www.rejseplan.dk/api/${service}`, { format: 'json' }),
        )
        // Not an answer the tracker could fall back from, but a fault that stops the request.
        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      }
      expect(logged.map(({ level }) => level)).toEqual(['Error', 'Error', 'Error', 'Error'])
      expect(logged[0].message).toMatch(/MYLDER_SOURCE=timetable/)
      expect(logged[0].message).toMatch(/journeyPos/)
    }).pipe(
      Effect.provide(apiLayer({ source: readSource('timetable'), timetable })),
      Effect.provide(
        Logger.layer([
          Logger.make(
            ({ logLevel, message }) =>
              void logged.push({ level: logLevel, message: [message].flat().join(' ') }),
          ),
        ]),
      ),
    )
  })
})

describe('the update switch beside the source switch', () => {
  it('runs as set under the timetable, a recording and Rejseplanen', () => {
    for (const source of ['timetable', 'recording:weekday', 'rejseplanen']) {
      expect(updatesFor(readSource(source), readUpdates('siri'))).toEqual({
        updates: { kind: 'siri' },
      })
    }
  })

  it('is ignored under the simulation, which brings its own updates, and says so', () => {
    const { updates, warning } = updatesFor(readSource('simulated'), readUpdates('siri'))
    expect(updates).toEqual({ kind: 'off' })
    expect(warning).toMatch(/MYLDER_UPDATES=siri is ignored under MYLDER_SOURCE=simulated/)
  })

  it('says nothing when it is off under the simulation', () => {
    expect(updatesFor(readSource('simulated:patchy'), readUpdates(undefined))).toEqual({
      updates: { kind: 'off' },
    })
  })
})
