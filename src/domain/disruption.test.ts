import { describe, expect, it } from 'vitest'
import { disruptionKind, disruptionPhase, type Disruption } from './disruption'

// 08:00 in Copenhagen on Monday 2026-10-26.
const NOW = Date.UTC(2026, 9, 26, 7)
const HOUR = 3600_000
const DAY = 24 * HOUR

const signalFault: Disruption = {
  fieldsKind: 'delays',
  from: NOW - HOUR,
  to: NOW + 2 * HOUR,
  message: { act: true },
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
    expect(disruptionKind({ fieldsKind: 'service-notice', message: {} }, NOW)).toBe(
      'service-notice',
    )
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
    expect(disruptionPhase({ fieldsKind: 'delays', message: { act: true } }, NOW)).toBe('active')
    expect(disruptionPhase({ fieldsKind: 'delays', message: {} }, NOW)).toBe('active')
    expect(disruptionPhase({ fieldsKind: 'delays', message: { act: false } }, NOW)).toBe('later')
  })
})
