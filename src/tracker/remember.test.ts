import { describe, expect, it } from 'vitest'
import { remember } from './remember'

describe('remember', () => {
  it('builds once and keeps what it built', async () => {
    let builds = 0
    const runtime = remember(async () => ++builds)
    expect(await Promise.all([runtime(), runtime()])).toEqual([1, 1])
    expect(await runtime()).toBe(1)
  })

  it('forgets a build that failed, so the next ask builds again', async () => {
    let builds = 0
    const runtime = remember(async () => {
      if (++builds === 1) throw new Error('no timetable')
      return builds
    })
    await expect(runtime()).rejects.toThrow('no timetable')
    expect(await runtime()).toBe(2)
  })
})
