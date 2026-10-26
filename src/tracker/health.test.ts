import { describe, expect, it } from 'vitest'
import { answerOutcome, EMPTY_ANSWER_MIN_UNDERWAY, healthAfter } from './health'

const now = Date.UTC(2026, 5, 16, 5, 20, 30)

describe('answerOutcome', () => {
  it('calls an answer with no trips empty when the timetable expects enough underway', () => {
    expect(answerOutcome(0, EMPTY_ANSWER_MIN_UNDERWAY)).toEqual({ status: 'empty' })
  })

  it('calls an empty answer ok at night, when the timetable expects fewer underway', () => {
    expect(answerOutcome(0, EMPTY_ANSWER_MIN_UNDERWAY - 1)).toEqual({ status: 'ok' })
  })

  it('calls an answer with any trip ok', () => {
    expect(answerOutcome(1, 900)).toEqual({ status: 'ok' })
  })
})

describe('healthAfter', () => {
  it('keeps the start of a health that carries on, and starts a new one at its moment', () => {
    const error = { status: 'error', since: now - 120_000, kind: 'status' } as const
    expect(healthAfter(error, { status: 'error', kind: 'timeout' }, now)).toEqual({
      status: 'error',
      since: now - 120_000,
      kind: 'timeout',
    })
    expect(healthAfter(error, { status: 'ok' }, now)).toEqual({ status: 'ok', since: now })
    expect(healthAfter(undefined, { status: 'empty' }, now)).toEqual({
      status: 'empty',
      since: now,
    })
  })
})
