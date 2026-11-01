import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../tracker/index'
import { pausedFrom } from './pulse'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** A saved snapshot of a recording's minute. */
const saved = (recording: string, name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

/**
 * The timetable source's six saved minutes, 07:20 to 07:25 in Copenhagen: the tracker's run with
 * no call, position mode none, the API ok and nothing spent.
 */
const ON_TIMETABLE = ['0001.json', '0002.json', '0003.json', '0004.json', '0005.json', '0006.json']
const onTimetable = saved('timetable-source', '0006.json')

describe("City pulse's paused rule on the timetable source", () => {
  // The source asks Rejseplanen nothing, so no position answer can stop coming: no moment is the
  // one positions pause from, whichever minute the snapshot is.
  it.each(ON_TIMETABLE)('is never set on minute %s', (name) => {
    expect(pausedFrom(saved('timetable-source', name))).toBeUndefined()
  })

  // Nor whatever else the snapshot says, as no run on this source can make it say.
  it.each([
    ['with the API failing', { api: { status: 'error', since: onTimetable.fetched - HOUR } }],
    ['with the API empty', { api: { status: 'empty', since: onTimetable.fetched - HOUR } }],
    ['with the month spent', { budget: { level: 'spent', calls: 0, resumes: '2026-07-01' } }],
    ['with an old position', { lastSeen: { bus: onTimetable.fetched - 3 * HOUR } }],
  ] satisfies [string, Partial<Snapshot>][])('is never set %s', (_, change) => {
    expect(pausedFrom({ ...onTimetable, ...change })).toBeUndefined()
  })

  it('still pauses at once with no position calls on another source', () => {
    // Position mode none on a simulation or a recording means no positions come, so City pulse
    // reads them as paused from the start.
    for (const kind of ['simulated', 'recording', 'rejseplanen'] as const) {
      expect(pausedFrom({ ...onTimetable, source: { kind } })).toBe(-Infinity)
    }
  })

  it('still pauses a failing API at the Live limit on another source', () => {
    // The weekday's 07:25 answer, its modes alternating, so its Live limit is 240 s: failing
    // since a minute before it, positions pause 180 s after it.
    const weekday = saved('weekday', '0006.json')
    const failing: Snapshot = {
      ...weekday,
      api: { status: 'error', since: weekday.fetched - MINUTE },
    }
    expect(pausedFrom(failing)).toBe(weekday.fetched + 3 * MINUTE)
  })
})
