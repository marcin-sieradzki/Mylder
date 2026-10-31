import type { Page } from '@playwright/test'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { realTap } from './lib.ts'
import { footCheck, holdDrag, log, settle, type Size } from './peek.ts'


function softer() {
  const fails: string[] = []
  const soft = async (fn: () => Promise<unknown>) => {
    try {
      return await fn()
    } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).split('\n').slice(0, 6).join(' | ')
      fails.push(m)
      log('SOFT-FAIL', m)
    }
  }
  const done = () => {
    if (fails.length) throw new Error(`${fails.length} check(s) failed:\n- ${fails.join('\n- ')}`)
  }
  return { soft, done }
}

// The stop's own sheet (any bottom dialog but the Overview): its name, top and peek, and the credit's bottom.
async function stopSheet(page: Page) {
  return page.evaluate(() => {
    const ds = [...document.querySelectorAll('[role="dialog"][data-anchor="bottom"]')]
      .map((d) => ({ name: document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent ?? d.getAttribute('aria-label'), r: d.getBoundingClientRect() }))
      .filter((s) => s.name !== 'Overview' && s.r.height > 0)
    const credit = document.querySelector('a[href="https://www.rejseplanen.dk/"]')!.parentElement!.getBoundingClientRect()
    const s = ds[ds.length - 1]
    return { name: s?.name ?? null, top: s ? s.r.top : null, peek: s ? innerHeight - s.r.top : null, creditBottom: credit.bottom, gap: s ? s.r.top - credit.bottom : null, vh: innerHeight }
  })
}

async function settleSheet(page: Page) {
  let prev = await stopSheet(page)
  const end = Date.now() + 6000
  while (Date.now() < end) {
    await page.waitForTimeout(300)
    const cur = await stopSheet(page)
    if (cur.top !== null && prev.top !== null && Math.abs(cur.top - prev.top) < 0.5 && Math.abs(cur.creditBottom - prev.creditBottom) < 0.5) return cur
    prev = cur
  }
  return prev
}

async function sampleTops(page: Page, n = 12, ms = 120) {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const s = await stopSheet(page)
    out.push(Math.round((s.top ?? -1) * 10) / 10)
    await page.waitForTimeout(ms)
  }
  return out
}

// N1: Refshaleøen with the 991 standing, then a missing stop reached in the same panel by pushState, back and
// forward, with and without a finger holding the sheet: the not-found sheet settles at the least peek (the same as a
// direct ?stop=nowhere link), the credit just above it.
export async function missingAfterStanding(j: Journey, size: Size) {
  const { page, step, expect } = j
  if (size) await page.setViewportSize(size)
  const { soft, done } = softer()
  // reference: a stop not found by link
  await page.goto('/en?stop=nowhere')
  await expect(page.getByRole('dialog', { name: 'Stop not found' })).toBeVisible()
  const ref = await settleSheet(page)
  log('REF not found by link', ref)
  await step('reference: ?stop=nowhere by link')
  const least = ref.top!
  const near = (label: string, s: Awaited<ReturnType<typeof stopSheet>>) =>
    soft(async () => {
      expect(s.name, `${label}: panel`).toBe('Stop not found')
      expect(Math.abs(s.top! - least), `${label}: not-found sheet at the least peek (top ${s.top}, want ${least})`).toBeLessThan(1)
      expect(s.gap!, `${label}: credit just above the sheet (gap ${s.gap})`).toBeGreaterThanOrEqual(-0.5)
      expect(s.gap!, `${label}: credit just above the sheet, not left high (gap ${s.gap})`).toBeLessThan(14)
    })
  const tall = (label: string, s: Awaited<ReturnType<typeof stopSheet>>) =>
    soft(async () => {
      expect(s.name, `${label}: panel`).toBe('Refshaleøen')
      expect(s.gap!, `${label}: credit above the sheet (gap ${s.gap})`).toBeGreaterThanOrEqual(-0.5)
    })

  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const nf = page.getByRole('dialog', { name: 'Stop not found' })
  await expect(panel.getByRole('region', { name: 'At the platforms now' }).getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  const s0 = await settleSheet(page)
  log('A Refshaleøen standing', s0)
  await page.evaluate(() => { (window as any).__samePage = 1 })
  const same = (label: string) => soft(async () => expect(await page.evaluate(() => (window as any).__samePage), `${label}: same document, no reload`).toBe(1))
  await step('Refshaleøen, 991 standing, at its peek')
  await tall('Refshaleøen standing', s0)

  // pushState to a missing stop: the address changes without a navigation the app hears
  await page.evaluate(() => history.pushState(null, '', '/en?stop=nowhere'))
  await page.waitForTimeout(1500)
  const s1 = await settleSheet(page)
  log('B after pushState nowhere (no popstate)', s1, page.url())
  await step('pushState ?stop=nowhere (address only)')
  await page.goBack()
  await page.waitForTimeout(800)
  log('B2 back', await settleSheet(page), page.url())
  await page.goForward()
  await expect(nf).toBeVisible()
  const s1b = await settleSheet(page)
  log('B3 forward to nowhere', s1b, page.url())
  await step('back, forward: Stop not found')
  await near('first forward to nowhere', s1b)
  await soft(() => footCheck(page, expect, 'first forward to nowhere'))
  await same('first forward to nowhere')

  // back to Refshaleøen, the foot sampled frame by frame
  const stopB = await startFrames(page)
  await page.goBack()
  await expect(panel).toBeVisible()
  await page.waitForTimeout(1500)
  const br = analyse('back to Refshaleøen: sheet rises', await stopB())
  await soft(async () => expect(br.covered, 'back to Refshaleøen: frames with the credit under the sheet').toBe(0))
  const s2 = await settleSheet(page)
  log('C back to Refshaleøen', s2)
  await step('back: Refshaleøen')
  await tall('back to Refshaleøen', s2)

  // forward to the missing stop, the foot sampled frame by frame
  const stopF = await startFrames(page)
  await page.goForward()
  await expect(nf).toBeVisible()
  await page.waitForTimeout(1500)
  const fr = analyse('forward to not found: sheet lowers', await stopF())
  await soft(async () => expect(fr.covered, 'forward to not found: frames with the credit under the sheet').toBe(0))
  const s3 = await settleSheet(page)
  log('D forward nowhere', s3)
  await step('forward: Stop not found')
  await near('forward nowhere', s3)
  await soft(() => footCheck(page, expect, 'forward nowhere'))
  await same('forward nowhere')

  // back again, then forward while a finger holds the sheet
  await page.goBack()
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('region', { name: 'At the platforms now' }).getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  const s4 = await settleSheet(page)
  log('E back to Refshaleøen (2)', s4)
  const d = await holdDrag(page, panel.getByRole('heading', { name: 'Refshaleøen' }), -30)
  await page.waitForTimeout(300)
  const h0 = await stopSheet(page)
  log('F held on Refshaleøen', h0)
  await step('finger holds Refshaleøen 30 px up')
  await page.evaluate(() => history.forward())
  await expect(nf).toBeVisible()
  const hs = await sampleTops(page)
  log('G held while forward to nowhere, tops', hs)
  await step('forward while held: Stop not found under the finger')
  await d.release()
  const s5 = await settleSheet(page)
  log('H released on not found', s5)
  await step('released: not-found sheet settles')
  await near('forward while held, released', s5)
  await soft(() => footCheck(page, expect, 'forward while held, released'))
  await same('forward while held, released')

  // from the not-found sheet, hold and go back to Refshaleøen, release: the tall peek again
  const d2 = await holdDrag(page, nf.getByRole('heading', { name: 'Stop not found' }), -30)
  await page.waitForTimeout(300)
  await page.evaluate(() => history.back())
  await expect(panel).toBeVisible()
  const hs2 = await sampleTops(page)
  log('I held while back to Refshaleøen, tops', hs2)
  await d2.release()
  const s6 = await settleSheet(page)
  log('J released on Refshaleøen', s6)
  await step('back while held, released: Refshaleøen')
  await tall('back while held, released', s6)
  await soft(() => footCheck(page, expect, 'back while held, released'))
  await same('back while held, released')

  done()
}

// Installs a rAF sampler: each frame, the topmost bottom sheet's top, the stop's sheet top, the credit's and legend's
// boxes. Returns a stop function that returns the frames.
async function startFrames(page: Page) {
  await page.evaluate(() => {
    const w = window as any
    w.__frames = []
    w.__sampling = true
    const credit = document.querySelector('a[href="https://www.rejseplanen.dk/"]')!.parentElement!
    const legend = document.querySelector('[aria-label="Data states"]')!
    const tick = (t: number) => {
      const sheets = [...document.querySelectorAll('[role="dialog"][data-anchor="bottom"]')]
        .map((d) => d.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.top < innerHeight)
      const sheetTop = Math.min(innerHeight, ...sheets.map((r) => r.top))
      const c = credit.getBoundingClientRect()
      const l = legend.getBoundingClientRect()
      w.__frames.push([Math.round(t), Math.round(sheetTop * 10) / 10, Math.round(c.bottom * 10) / 10, Math.round(l.bottom * 10) / 10])
      if (w.__sampling) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  return async () => {
    const frames: [number, number, number, number][] = await page.evaluate(() => {
      const w = window as any
      w.__sampling = false
      return w.__frames
    })
    return frames
  }
}

function analyse(label: string, frames: [number, number, number, number][]) {
  const covered = frames.filter(([, s, c, l]) => c > s + 0.5 || l > s + 0.5)
  const gaps = frames.map(([, s, c]) => Math.round((s - c) * 10) / 10)
  const moving = frames.filter((f, i) => i > 0 && (f[1] !== frames[i - 1][1] || f[2] !== frames[i - 1][2]))
  const first = frames[0]
  const last = frames[frames.length - 1]
  // the frames where the sheet or the credit moved, with their gap
  const motion = moving.map(([t, s, c]) => `${t}:${s}/${c}=${Math.round((s - c) * 10) / 10}`)
  log('FRAMES', { label, n: frames.length, first, last, gapMin: Math.min(...gaps), gapMax: Math.max(...gaps), coveredFrames: covered.length, covered: covered.slice(0, 10), motion: motion.length > 40 ? [...motion.slice(0, 20), '...', ...motion.slice(-20)] : motion })
  return { label, first, last, covered: covered.length }
}

// N2: the foot moves with the sheet frame by frame while the standing row appears (Bus on), empties (Bus off),
// the stop's sheet closes, and the 991 appears again.
export async function footFrames(j: Journey, size: Size, rate = 1) {
  const { page, step, expect } = j
  if (size) await page.setViewportSize(size)
  if (rate !== 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Animation.enable')
    await cdp.send('Animation.setPlaybackRate', { playbackRate: rate })
    log('animations slowed to', rate)
  }
  const { soft, done } = softer()
  await page.goto('/en?hide=bus&stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await settle(page, panel)
  await page.waitForTimeout(500)
  await step('Bus hidden, none standing, at its peek')
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })

  let stop = await startFrames(page)
  await chip.tap()
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await page.waitForTimeout(2500 / rate)
  const a = analyse('Bus on: row appears, sheet rises', await stop())
  await step('Bus on: 991 standing, sheet risen')
  await soft(async () => expect(a.last[1], 'sheet rose').toBeLessThan(a.first[1] - 5))

  stop = await startFrames(page)
  await chip.tap()
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await page.waitForTimeout(2500 / rate)
  const b = analyse('Bus off: row empties, sheet lowers', await stop())
  await step('Bus off: none standing, sheet lowered')
  await soft(async () => expect(b.last[1], 'sheet lowered').toBeGreaterThan(b.first[1] + 5))

  stop = await startFrames(page)
  await chip.tap()
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await page.waitForTimeout(2500 / rate)
  const c = analyse('Bus on again', await stop())
  await step('Bus on again')

  stop = await startFrames(page)
  await realTap(page, panel.getByRole('button', { name: 'Close' }), 'Refshaleøen', [])
  await expect(panel).toBeHidden()
  await page.waitForTimeout(2000 / rate)
  const e = analyse('stop sheet closed', await stop())
  await step('stop closed, Overview at peek')
  for (const x of [a, b, c, e]) await soft(async () => expect(x.covered, `${x.label}: frames with the credit or legend under the sheet`).toBe(0))
  done()
}

// N3: the 991 comes to stand at Orientkaj St. by the minute's answer (07:25), no finger: the foot follows the sheet
// frame by frame as it rises.
export async function naturalFrames({ page, step, expect }: Journey) {
  const fetchedIso = async () => new Date((await (await page.request.get('/api/snapshot')).json()).fetched).toISOString()
  await expect.poll(async () => (await fetchedIso()) >= '2026-06-16T05:24:00.000Z', { timeout: 300000, intervals: [2000] }).toBe(true)
  await page.goto('/en?stop=54307')
  const panel = page.getByRole('dialog', { name: 'Orientkaj St.' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await settle(page, panel)
  log('fetched', await fetchedIso())
  await step('Orientkaj, none standing yet')
  const stop = await startFrames(page)
  await expect(region.getByRole('button', { name: /^Bus 991/ })).toBeAttached({ timeout: 150000 })
  log('arrived at', await fetchedIso())
  await page.waitForTimeout(2500)
  const frames = await stop()
  // only the frames from a second before the sheet starts to move
  const i = frames.findIndex((f, k) => k > 0 && f[1] !== frames[k - 1][1])
  const a = analyse('991 arrives by the minute', frames.slice(Math.max(0, i - 60)))
  expect(a.covered, 'frames with the credit or legend under the sheet').toBe(0)
  await step('991 standing at Orientkaj, sheet risen')
  expect(a.last[1], 'sheet rose').toBeLessThan(a.first[1] - 5)
}
