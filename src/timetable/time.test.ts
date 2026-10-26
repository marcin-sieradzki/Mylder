import { describe, expect, it } from 'vitest'
import { clockTime } from './time.ts'

// 16 June 2026 at 05:25:07 UTC: summer time, so 07:25:07 in Copenhagen and 01:25:07 in New York.
const moment = Date.UTC(2026, 5, 16, 5, 25, 7)

describe("a moment on the timetable's clock", () => {
  it("reads as the zone's 24-hour clock, with seconds when asked", () => {
    expect(clockTime(moment, 'Europe/Copenhagen')).toBe('07:25')
    expect(clockTime(moment, 'Europe/Copenhagen', { seconds: true })).toBe('07:25:07')
    expect(clockTime(moment, 'America/New_York')).toBe('01:25')
    expect(clockTime(moment + 12 * 3_600_000, 'Europe/Copenhagen')).toBe('19:25')
  })
})
