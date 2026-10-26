import { describe, expect, it } from 'vitest'
import { disruptionKind, disruptionPhase, readList, type DisruptionFacts } from './disruption'

// 08:00 in Copenhagen on Monday 2026-10-26.
const NOW = Date.UTC(2026, 9, 26, 7)
const HOUR = 3600_000
const DAY = 24 * HOUR

const signalFault: DisruptionFacts = {
  fieldsKind: 'delays',
  from: NOW - HOUR,
  to: NOW + 2 * HOUR,
  act: true,
}

describe('a disruption’s kind', () => {
  it('is what its fields say while it runs a day or less', () => {
    expect(disruptionKind(signalFault, NOW)).toBe('delays')
  })

  it('is Planned works when it starts after now', () => {
    const tomorrow = { ...signalFault, from: NOW + DAY, to: NOW + DAY + HOUR }
    expect(disruptionKind(tomorrow, NOW)).toBe('planned-works')
    // Once it starts, its fields say again.
    expect(disruptionKind(tomorrow, NOW + DAY)).toBe('delays')
  })

  it('is Planned works when it spans more than a day, even while it runs', () => {
    const closure = { ...signalFault, from: NOW - DAY, to: NOW + DAY }
    expect(disruptionKind(closure, NOW)).toBe('planned-works')
  })

  it('is what its fields say when Rejseplanen gives no times', () => {
    expect(disruptionKind({ fieldsKind: 'service-notice' }, NOW)).toBe('service-notice')
  })

  it('is Planned works when Rejseplanen gives no times and flags it inactive', () => {
    expect(disruptionKind({ fieldsKind: 'delays', act: false }, NOW)).toBe('planned-works')
  })

  it('is what its fields say with only an end', () => {
    expect(disruptionKind({ fieldsKind: 'delays', to: NOW + DAY * 3 }, NOW)).toBe('delays')
  })
})

describe('a disruption’s phase', () => {
  it('is active from its start until its end', () => {
    expect(disruptionPhase(signalFault, NOW)).toBe('active')
    expect(disruptionPhase(signalFault, NOW - HOUR)).toBe('active')
    expect(disruptionPhase(signalFault, NOW + 2 * HOUR)).toBeUndefined()
  })

  it('is Later when it starts within the next 7 days', () => {
    const weekend = { ...signalFault, from: NOW + 5 * DAY, to: NOW + 6 * DAY }
    expect(disruptionPhase(weekend, NOW)).toBe('later')
    expect(disruptionPhase({ ...weekend, from: NOW + 7 * DAY }, NOW)).toBe('later')
  })

  it('is neither when it starts more than 7 days ahead', () => {
    const far = { ...signalFault, from: NOW + 8 * DAY, to: NOW + 9 * DAY }
    expect(disruptionPhase(far, NOW)).toBeUndefined()
  })

  it('stays active with no end once it has started', () => {
    const { to: _, ...openEnded } = signalFault
    expect(disruptionPhase(openEnded, NOW + 30 * DAY)).toBe('active')
  })

  it('follows Rejseplanen’s own active flag when it gives no times', () => {
    expect(disruptionPhase({ fieldsKind: 'delays', act: true }, NOW)).toBe('active')
    expect(disruptionPhase({ fieldsKind: 'delays' }, NOW)).toBe('active')
    expect(disruptionPhase({ fieldsKind: 'delays', act: false }, NOW)).toBe('later')
  })
})

describe('the disruption list at a moment', () => {
  const checkedAt = NOW - 5 * 60_000
  const list = (messages: DisruptionFacts[], more: Partial<Parameters<typeof readList>[0]> = {}) =>
    readList(
      { fetched: checkedAt, checked: checkedAt, ok: true, received: 3, messages, ...more },
      NOW,
    )
  const startingAt = (from: number): DisruptionFacts => ({
    fieldsKind: 'delays',
    from,
    to: from + HOUR,
  })

  it('lists active ones newest first, then Later by start, and leaves out the rest', () => {
    const older = startingAt(NOW - 30 * 60_000)
    const newer = startingAt(NOW - 10 * 60_000)
    const soon = startingAt(NOW + 2 * DAY)
    const sooner = startingAt(NOW + DAY)
    const ended = startingAt(NOW - 2 * HOUR)
    const read = list([older, soon, ended, newer, sooner])
    expect(read.active.map(({ disruption }) => disruption)).toEqual([newer, older])
    expect(read.later.map(({ disruption }) => disruption)).toEqual([sooner, soon])
    expect(read.later.map(({ kind }) => kind)).toEqual(['planned-works', 'planned-works'])
    expect(read.runningNormally).toBe(false)
  })

  it('says Running normally when nothing is active and the last check succeeded', () => {
    expect(list([]).runningNormally).toBe(true)
    expect(list([startingAt(NOW + DAY)]).runningNormally).toBe(true)
  })

  it('never says Running normally after a failed check, or before the first', () => {
    const failed = list([], { ok: false })
    expect(failed.runningNormally).toBe(false)
    expect(failed.lastCheckFailed).toBe(true)
    expect(list([], { fetched: null, checked: null }).runningNormally).toBe(false)
  })

  it('marks the list out of date an hour after its last good answer', () => {
    expect(list([], { fetched: NOW - HOUR }).outOfDate).toBe(false)
    expect(list([], { fetched: NOW - HOUR - 1, ok: false }).outOfDate).toBe(true)
    expect(list([], { fetched: null, ok: false }).outOfDate).toBe(false)
  })

  it('warns that an answer of exactly 100 messages may be cut short', () => {
    expect(list([], { received: 100 }).mayBeIncomplete).toBe(true)
    expect(list([], { received: 99 }).mayBeIncomplete).toBe(false)
  })
})
