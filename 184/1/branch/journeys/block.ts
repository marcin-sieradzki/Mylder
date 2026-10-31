// Pass rule 3: after the first answer lands, the board's next answers fail (abort / 503) or never come (overdue):
// the source line says "may be out of date" once the answer is old enough; then the route is let through again.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, seen, boardLog, fmt, recClock } from './source.ts'
import { writeFileSync } from 'node:fs'

export const block = (board: 'departures' | 'arrivals', how: 'abort' | '503' | 'hang', run: string, out: string) =>
  async ({ page, step, expect }: Journey) => {
    await record(page)
    const log = boardLog(page)
    const tab = board === 'departures' ? 'Departures' : 'Arrivals'
    await page.goto(board === 'departures' ? '/en?stop=8600783' : '/en?stop=8600783&board=arrivals')
    const panel = page.getByRole('dialog', { name: 'København Syd St.' })
    const tp = panel.getByRole('tabpanel', { name: tab })
    const fresh = new RegExp(`Rejseplanen[^]*${board} (\\d\\d:\\d\\d(:\\d\\d)?)`)
    await expect(tp).toContainText(fresh, { timeout: 20000 })
    const shown = (await tp.textContent())!.match(fresh)![1]
    await step(`${board} first answer ${shown} rec ${recClock(run)}`)
    const pending: Array<() => void> = []
    await page.route('**/api/stops/8600783**', async (route) => {
      log.push(`  route ${how}: ${route.request().url()}`)
      if (how === 'abort') return route.abort()
      if (how === '503') return route.fulfill({ status: 503, body: 'Service Unavailable' })
      await new Promise<void>((r) => pending.push(r)) // never answers while blocked
      return route.abort().catch(() => {})
    })
    const blockedAt = Date.now()
    log.push(`blocked at rec ${recClock(run)}; answer shown ${shown}`)
    await expect(tp).toContainText(/may be out of date/, { timeout: 180000 })
    const warnAt = Date.now()
    const warnRec = recClock(run, warnAt)
    const line = (await tp.textContent())!.match(/Rejseplanen[^]{0,6}?(departures|arrivals)[^]{0,4}?\d\d:\d\d(:\d\d)?, may be out of date/)?.[0]
    const [h, m, s] = shown.split(':').map(Number)
    const [wh, wm, ws] = warnRec.split(':').map(Number)
    const age = (wh * 3600 + wm * 60 + ws) - (h * 3600 + m * 60 + (s || 0))
    const summary = `warned ${((warnAt - blockedAt) / 1000).toFixed(1)} s after blocking, at rec ~${warnRec}, answer time ${shown}: age ~${age} s. Line: ${line}`
    log.push(summary)
    console.log(summary)
    await step(`${board} ${how} warns age ${age}s`)
    expect(line, 'the source line itself says may be out of date').toBeTruthy()
    // Let answers through again: the warning should go once a fresh answer lands.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    pending.forEach((r) => r())
    log.push(`unblocked at rec ${recClock(run)}`)
    let recovered = 'no'
    try {
      await expect(tp).not.toContainText(/may be out of date/, { timeout: 120000 })
      recovered = `yes, at rec ~${recClock(run)} (${((Date.now() - warnAt) / 1000).toFixed(1)} s after unblocking)`
      await step(`${board} ${how} recovered`)
    } catch { await step(`${board} ${how} not recovered`) }
    log.push(`recovered: ${recovered}`)
    const all = await seen(page)
    writeFileSync(out, `${summary}\nrecovered: ${recovered}\n\nSource line, every text it took:\n${fmt(all, run)}\n\nBoard requests:\n${log.join('\n')}\n`)
    expect(age, 'warns within about 90 s of the answer time').toBeLessThanOrEqual(95)
  }
