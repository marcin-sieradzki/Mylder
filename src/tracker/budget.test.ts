import { describe, expect, it } from 'vitest'
import { wallClock } from '../timetable/time'
import { MONTHLY_CALLS, monthOf, pacing, SPENT_AT } from './budget'

const zone = 'Europe/Copenhagen'
const october = monthOf(Date.UTC(2026, 9, 15, 12), zone)
/** A moment in October 2026 a share of the way through the month. */
const at = (share: number) => october.start + share * (october.end - october.start)
/** The calls the line allows at a share of the month, as the run counts it. */
const line = (share: number) => pacing({ calls: 0, now: at(share), timezone: zone }).line

describe('monthOf', () => {
  it('runs from midnight on the 1st to midnight on the next 1st, in the zone', () => {
    expect(october.start).toBe(wallClock('2026-10-01', 0, zone))
    expect(october.end).toBe(wallClock('2026-11-01', 0, zone))
    expect(october.next).toBe('2026-11-01')
  })
})

describe('pacing', () => {
  it('is normal with a cushion when the month spends under its line', () => {
    expect(pacing({ calls: line(0.5) - 500, now: at(0.5), timezone: zone })).toMatchObject({
      level: 'normal',
      onDemand: true,
      pollInterval: 60,
      disruptionsEvery: 15,
    })
  })

  it('stops on-demand calls within 100 of the line, still at 60 s', () => {
    expect(pacing({ calls: line(0.5) - 50, now: at(0.5), timezone: zone })).toMatchObject({
      level: 'normal',
      onDemand: false,
      pollInterval: 60,
    })
  })

  it('stretches to 90 s when the month runs ahead of its line', () => {
    expect(pacing({ calls: line(0.5) + 1, now: at(0.5), timezone: zone })).toMatchObject({
      level: 'stretched',
      onDemand: false,
      pollInterval: 90,
      disruptionsEvery: 15,
    })
  })

  it('tightens to 120 s and disruptions every 30 min over 1,500 ahead', () => {
    expect(pacing({ calls: line(0.5) + 1_501, now: at(0.5), timezone: zone })).toMatchObject({
      level: 'tight',
      pollInterval: 120,
      disruptionsEvery: 30,
    })
  })

  it('is spent at 49,500 calls or after a quota error, until the 1st', () => {
    const spent = { level: 'spent', onDemand: false, resumes: '2026-11-01' }
    expect(pacing({ calls: SPENT_AT, now: at(0.99), timezone: zone })).toMatchObject(spent)
    expect(pacing({ calls: 10, now: at(0.1), timezone: zone, quotaGone: true })).toMatchObject(
      spent,
    )
    expect(pacing({ calls: 0, now: october.end, timezone: zone }).level).toBe('normal')
  })

  it('keeps a month watched round the clock at 60 s normal, with a disruption call every 15 min', () => {
    let calls = 0
    const levels = new Set<string>()
    for (let now = october.start; now < october.end; now += 60_000) {
      levels.add(pacing({ calls, now, timezone: zone }).level)
      const minute = (now - october.start) / 60_000
      calls += 1 + (minute % 15 === 0 ? 1 : 0)
    }
    expect([...levels]).toEqual(['normal'])
    expect(calls).toBeLessThan(MONTHLY_CALLS)
  })
})
