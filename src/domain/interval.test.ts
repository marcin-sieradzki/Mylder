import { describe, expect, it } from 'vitest'
import { intervalOf } from './interval'

describe('intervalOf', () => {
  const hour = (h: number) => Date.UTC(2026, 9, 26, h)
  // An M3 platform's planned departures, one direction, by minute past the hour.
  const m3 = {
    rush: [0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57],
    evening: [0, 6, 12, 18, 24, 30, 36, 42, 48, 54],
    even: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57],
  }
  const departures = (h: number, past: number[]) => past.map((m) => hour(h) + m * 60_000)

  it.each([
    ['every 3 to 4 min at rush hour', departures(8, m3.rush), 8, { from: 3, to: 4 }],
    ['every 6 min in the evening', departures(21, m3.evening), 21, { from: 6, to: 6 }],
    ['every 3 min when the gaps are even', departures(14, m3.even), 14, { from: 3, to: 3 }],
  ])('gives %s', (_, planned, h, interval) => {
    expect(intervalOf(planned, hour(h), hour(h + 1))).toEqual(interval)
  })

  it('reads only the hour asked for, in any order', () => {
    const planned = [...departures(21, m3.evening), ...departures(8, m3.rush)].reverse()
    expect(intervalOf(planned, hour(8), hour(9))).toEqual({ from: 3, to: 4 })
    expect(intervalOf(planned, hour(21), hour(22))).toEqual({ from: 6, to: 6 })
  })

  it('gives each direction its own interval', () => {
    // The other direction at rush hour, leaving a minute and a half later, every 4 to 5 min.
    const other = [1.5, 5.5, 10.5, 14.5, 19.5, 23.5, 28.5, 32.5, 37.5, 41.5, 46.5, 50.5, 55.5]
    expect(intervalOf(departures(8, other), hour(8), hour(9))).toEqual({ from: 4, to: 5 })
  })

  it('has no interval for an hour with fewer than two departures', () => {
    expect(intervalOf([hour(3)], hour(3), hour(4))).toBeUndefined()
  })
})
