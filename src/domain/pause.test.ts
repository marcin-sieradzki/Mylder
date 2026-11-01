import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lastAnswer, pauseAt, type PauseFacts } from './pause'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The timetable source's last saved minute, 07:25:00 in Copenhagen on 16 June 2026. */
const onTimetable = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'timetable-source', 'snapshots', '0006.json'),
    'utf8',
  ),
) as PauseFacts & { readonly fetched: number }

const NOW = onTimetable.fetched

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
