// Pass rules 1 and 2: open København Syd St. by link on a fresh board and watch the source line for 3 minutes.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, seen, boardLog, fmt, durations, recClock } from './source.ts'
import { writeFileSync } from 'node:fs'

export const watch = (board: 'departures' | 'arrivals', run: string, out: string) =>
  async ({ page, step, expect }: Journey) => {
    await record(page)
    const log = boardLog(page)
    const tab = board === 'departures' ? 'Departures' : 'Arrivals'
    await page.goto(board === 'departures' ? '/en?stop=8600783' : '/en?stop=8600783&board=arrivals')
    const panel = page.getByRole('dialog', { name: 'København Syd St.' })
    const tp = panel.getByRole('tabpanel', { name: tab })
    await expect(tp).toContainText(new RegExp(`Rejseplanen[^]*${board} \\d\\d:\\d\\d`), { timeout: 20000 })
    await expect(page).toHaveURL(board === 'departures' ? /\?stop=8600783$/ : /\?stop=8600783&board=arrivals$/)
    await step(`${board} settled rec ${recClock(run)}`)
    const start = Date.now()
    const mins = Number(process.env.WATCH_MIN || 3)
    for (let m = 1; m <= mins; m++) {
      while (Date.now() - start < m * 60000) await page.waitForTimeout(5000)
      await step(`${board} after ${m} min rec ${recClock(run)}`)
    }
    await page.waitForTimeout(2000)
    const all = await seen(page)
    const endT = await page.evaluate(() => performance.now())
    const text = fmt(all, run)
    const durs = durations(all, endT).filter((s) => s.warn).map((s) => `WARN for ${s.ms.toFixed(0)} ms: ${s.line}`)
    writeFileSync(out, `Source line, every text it took (${board}):\n${text}\n\nWarnings:\n${durs.join('\n') || '(none)'}\n\nBoard requests:\n${log.join('\n')}\n`)
    console.log(text)
    const times = new Set(all.map((s) => s.line.match(/\d\d:\d\d(:\d\d)?/)?.[0]).filter(Boolean))
    console.log('call times seen:', [...times].join(', '))
    expect(all.filter((s) => s.warn), `the source line read "may be out of date": ${durs.join('; ')}`).toEqual([])
    expect(times.size, 'at least three answers landed while watched').toBeGreaterThanOrEqual(3)
  }
