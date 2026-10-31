import type { Locator, Page } from '@playwright/test'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

type Expect = Journey['expect']
export type Size = { width: number; height: number } | undefined
export const P390 = { width: 390, height: 844 }

export const log = (...a: unknown[]) => console.log(...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))))

// Waits until the locator's box stops moving (two reads 300 ms apart agree to the pixel).
export async function settle(page: Page, target: Locator, ms = 6000) {
  const end = Date.now() + ms
  let prev = await target.boundingBox()
  while (Date.now() < end) {
    await page.waitForTimeout(300)
    const cur = await target.boundingBox()
    if (prev && cur && Math.abs(prev.y - cur.y) < 0.5 && Math.abs(prev.height - cur.height) < 0.5) return cur
    prev = cur
  }
  return prev
}

// The tablist fully on screen without any scroll: its box against the viewport, no scrolled box
// inside the panel or the page, toBeInViewport (which never scrolls), and each tab's centre hits
// the tab itself in the stop's dialog (nothing covers it).
export async function tabsAtPeek(page: Page, panel: Locator, expect: Expect, label: string) {
  const vp = page.viewportSize()!
  await settle(page, panel)
  const tl = panel.getByRole('tablist', { name: 'Departures and arrivals' })
  const box = await tl.boundingBox()
  const pbox = await panel.boundingBox()
  // only the stop's own sheet and the page: another sheet (the Overview behind) may keep its own scroll
  const scrolled = await panel.evaluate((p) => {
    const s = [p, ...p.querySelectorAll('*')].filter((e) => e.scrollTop > 0).map((e) => `${e.tagName}.${e.className}`.slice(0, 60))
    const others = [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0 && !p.contains(e)).map((e) => `${e.tagName}.${e.className}`.slice(0, 60))
    return { scrolledBoxes: s, otherScrolled: others, windowY: window.scrollY }
  })
  const tabs = []
  for (const name of ['Departures', 'Arrivals']) {
    const tab = panel.getByRole('tab', { name })
    const tb = (await tab.boundingBox())!
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      const d = el?.closest('[role="dialog"]')
      return { inTab: !!el?.closest('[role="tab"]'), tab: el?.closest('[role="tab"]')?.textContent, dialogLabelledBy: d?.getAttribute('aria-labelledby') }
    }, [tb.x + tb.width / 2, tb.y + tb.height / 2] as const)
    tabs.push({ name, box: tb, hit })
  }
  const ownLabel = await panel.getAttribute('aria-labelledby')
  const result = {
    label,
    vp,
    sheetTop: pbox?.y,
    peek: pbox ? vp.height - pbox.y : null,
    tablist: box,
    tablistBottomGap: box ? vp.height - (box.y + box.height) : null,
    ...scrolled,
    tabs,
  }
  log('TABS', result)
  expect(box, 'tablist has a box').not.toBeNull()
  expect(box!.y, `${label}: tablist top on screen`).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height, `${label}: tablist bottom on screen (vp ${vp.height})`).toBeLessThanOrEqual(vp.height + 0.5)
  expect(scrolled.scrolledBoxes, `${label}: nothing scrolled`).toEqual([])
  expect(scrolled.windowY).toBe(0)
  await expect(tl).toBeInViewport({ ratio: 0.99 })
  for (const t of tabs) {
    expect(t.hit.inTab && t.hit.dialogLabelledBy === ownLabel, `${label}: ${t.name} tab not covered`).toBe(true)
  }
  return result
}

// The map's foot: the corner credit (every link) and the legend fully on screen, wholly above
// the top of every bottom sheet shown, and not covered at their links' centres or their corners.
export async function footCheck(page: Page, expect: Expect, label: string, opts: { strict?: boolean } = {}) {
  const strict = opts.strict ?? true
  const vp = page.viewportSize()!
  const credit = page.getByRole('link', { name: 'Rejseplanen' }).locator('xpath=..')
  const legend = page.getByRole('list', { name: 'Data states' })
  await settle(page, credit, 3000)
  const res = await page.evaluate(() => {
    const credit = document.querySelector('a[href="https://www.rejseplanen.dk/"]')!.parentElement!
    const legend = document.querySelector('[aria-label="Data states"]')!
    const sheets = [...document.querySelectorAll('[role="dialog"][data-anchor="bottom"]')]
      .map((d) => ({ id: d.getAttribute('aria-labelledby'), name: document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent ?? d.getAttribute('aria-label'), r: d.getBoundingClientRect() }))
      .filter((s) => s.r.height > 0 && s.r.top < innerHeight)
    const sheetTop = Math.min(innerHeight, ...sheets.map((s) => s.r.top))
    const covered: string[] = []
    const probe = (el: Element, name: string) => {
      for (const r of [...el.getClientRects()]) {
        const pts = [
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left + 2, r.top + 2],
          [r.right - 2, r.bottom - 2],
        ]
        for (const [x, y] of pts) {
          const hit = document.elementFromPoint(x, y)
          if (!hit || !(el.contains(hit) || hit.contains(el) && hit === el)) covered.push(`${name} @${Math.round(x)},${Math.round(y)} -> ${hit?.tagName}.${String(hit?.className).slice(0, 40)} ${(hit?.closest('[role=dialog]')?.getAttribute('aria-labelledby')) ?? ''}`)
        }
      }
    }
    for (const a of credit.querySelectorAll('a')) probe(a, a.textContent ?? 'a')
    const lr = legend.getBoundingClientRect()
    for (const [x, y] of [[lr.left + 4, lr.top + 4], [lr.right - 4, lr.bottom - 4], [lr.left + lr.width / 2, lr.top + lr.height / 2]]) {
      const hit = document.elementFromPoint(x, y)
      if (!hit || !legend.contains(hit)) covered.push(`legend @${Math.round(x)},${Math.round(y)} -> ${hit?.tagName}.${String(hit?.className).slice(0, 40)}`)
    }
    const cr = credit.getBoundingClientRect()
    return { credit: { top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right }, legend: { top: lr.top, bottom: lr.bottom }, sheets: sheets.map((s) => ({ name: s.name, top: s.r.top })), sheetTop, covered }
  })
  const out = { label, vp, ...res, gap: res.sheetTop - res.credit.bottom }
  log('FOOT', out)
  if (strict) {
    expect(res.credit.top, `${label}: credit top on screen`).toBeGreaterThanOrEqual(0)
    expect(res.credit.bottom, `${label}: credit above the sheet (sheet top ${res.sheetTop})`).toBeLessThanOrEqual(res.sheetTop + 0.5)
    expect(res.legend.bottom, `${label}: legend above the sheet`).toBeLessThanOrEqual(res.sheetTop + 0.5)
    expect(res.covered, `${label}: nothing covers the credit or legend`).toEqual([])
  }
  await expect(credit).toBeInViewport({ ratio: 0.99 })
  return out
}

// A finger on the sheet's heading; moves by dy in steps, holds, and returns a release.
export async function holdDrag(page: Page, handle: Locator, dy: number) {
  const h = (await handle.boundingBox())!
  const x = h.x + Math.min(60, h.width / 2)
  const y0 = h.y + h.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  const steps = 12
  let y = y0
  for (let i = 1; i <= steps; i++) {
    y = Math.max(2, y0 + (dy * i) / steps)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await page.waitForTimeout(16)
  }
  return {
    // keep the finger alive with tiny moves on the same spot (a held finger sends no events, but this
    // keeps the gesture from looking like a fling)
    nudge: async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 0.5 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    },
    release: async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(900)
    },
  }
}

export async function drag(page: Page, handle: Locator, dy: number) {
  const d = await holdDrag(page, handle, dy)
  await d.release()
}

export async function fetchedIso(page: Page) {
  const snap = await (await page.request.get('/api/snapshot')).json()
  return new Date(snap.fetched).toISOString()
}

export async function waitMinute(page: Page, expect: Expect, iso: string) {
  await expect.poll(async () => (await fetchedIso(page)) >= iso, { timeout: 300000, intervals: [2000] }).toBe(true)
}

// A slow finger drag from (x, y0) by dy.
export async function fingerDrag(page: Page, x: number, y0: number, dy: number, steps = 40, ms = 30) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * i) / steps }] })
    await page.waitForTimeout(ms)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(900)
}
