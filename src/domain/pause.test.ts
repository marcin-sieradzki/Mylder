import { describe, expect, it } from 'vitest'
import { lastAnswer, pauseAt, type PauseFacts } from './pause'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// 07:25 in Copenhagen on Tuesday 16 June 2026.
const NOW = Date.UTC(2026, 5, 16, 5, 25)

/**
 * A snapshot on the timetable source, as the tracker builds it (recordings/timetable-source):
 * no call made, so the API is ok since the first run, no budget spent and no position seen.
 */
const onTimetable: PauseFacts & { readonly fetched: number } = {
  fetched: NOW,
  api: { status: 'ok', since: NOW - 5 * MINUTE },
  budget: { level: 'normal' },
  lastSeen: {},
  source: { kind: 'timetable' },
}

describe('the pause rule on the timetable source', () => {
  // The source asks Rejseplanen nothing, so nothing can stop answering: whatever else the
  // snapshot says, live data is never paused, minutes or hours after it was built.
  it.each([
    ['as built', onTimetable],
    ['with the month spent', { ...onTimetable, budget: { level: 'spent', resumes: '2026-07-01' } }],
    ['with the API failing', { ...onTimetable, api: { status: 'error', since: NOW - HOUR } }],
    ['with the API empty', { ...onTimetable, api: { status: 'empty', since: NOW - HOUR } }],
    ['with an old position', { ...onTimetable, lastSeen: { bus: NOW - 3 * HOUR } }],
  ] satisfies [string, PauseFacts][])('gives no pause %s', (_, facts) => {
    for (const later of [0, 5 * MINUTE, 3 * HOUR, 30 * HOUR]) {
      expect(pauseAt(facts, NOW + later, 4 * MINUTE)).toBeUndefined()
    }
  })

  it('still pauses the same facts on another source', () => {
    const failing = { ...onTimetable, api: { status: 'error' as const, since: NOW - HOUR } }
    expect(pauseAt({ ...failing, source: { kind: 'simulated' } }, NOW, 4 * MINUTE)).toEqual({
      reason: 'no-answer',
      since: NOW - HOUR,
    })
  })
})

describe('the last answer on the timetable source', () => {
  // The Updated line's time: the positions were placed when the snapshot was built.
  it('is when the snapshot was built, whatever its health says', () => {
    expect(lastAnswer(onTimetable)).toBe(NOW)
    const failing = { ...onTimetable, api: { status: 'error' as const, since: NOW - HOUR } }
    expect(lastAnswer(failing)).toBe(NOW)
    expect(lastAnswer({ ...failing, source: { kind: 'simulated' } })).toBeUndefined()
  })
})
