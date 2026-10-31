import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { realTap } from './lib.ts'
import { drag, fingerDrag, footCheck, holdDrag, log, settle, tabsAtPeek, type Size } from './peek.ts'

// Soft checks: every state is driven on main too, and the journey fails at its end with every miss.
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

async function baselineFoot({ page, step, expect }: Journey, url = '/en') {
  await page.goto(url)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Overview' })).toBeVisible()
  await settle(page, page.getByRole('dialog', { name: 'Overview' }))
  const f = await footCheck(page, expect, 'baseline, Overview at peek')
  await step('map with Overview at peek (baseline foot)')
  return f
}

// P1: a stop with a trip standing (Refshaleøen, the 991), opened by link: the tablist is on screen at the peek;
// then the standing card's vehicle, Show whole line, and Close, the foot followed throughout.
export async function standingLink(j: Journey, size: Size) {
  const { page, step, expect } = j
  if (size) await page.setViewportSize(size)
  const { soft, done } = softer()
  const base = await baselineFoot(j)
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel).toBeVisible()
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await settle(page, panel)
  await step('stop link with 991 standing, at its peek (no drag, no scroll)')
  await soft(() => tabsAtPeek(page, panel, expect, 'standing link'))
  await soft(() => footCheck(page, expect, 'standing link'))
  await realTap(page, region.getByRole('button', { name: 'Bus 991 to Teglholmen' }), 'Refshaleøen', [])
  const vehicle = page.getByRole('dialog', { name: /991 to Teglholmen/ })
  await expect(vehicle).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  await settle(page, vehicle)
  await step('vehicle opened from the standing card')
  await soft(() => footCheck(page, expect, 'vehicle from standing card'))
  await realTap(page, vehicle.getByRole('button', { name: 'Show whole line' }), /991 to Teglholmen/, [])
  await expect(page.getByRole('button', { name: /^Showing: line .* · Clear$/ })).toBeVisible()
  await page.waitForTimeout(2500)
  log('URL after fit', page.url())
  await step('Show whole line fit')
  await soft(() => footCheck(page, expect, 'after Show whole line'))
  await realTap(page, vehicle.getByRole('button', { name: 'Close' }), /991 to Teglholmen/, [])
  await expect(vehicle).toBeHidden()
  await page.waitForTimeout(800)
  const after = await soft(() => footCheck(page, expect, 'vehicle closed'))
  await step('vehicle closed')
  await soft(async () => expect(Math.abs((after as any).credit.bottom - base.credit.bottom), 'foot back to baseline after close').toBeLessThan(1))
  done()
}

// P2: a stop with nothing standing (Nørreport St.) opens with its tabs at the peek; Close brings the foot back.
export async function noneLink(j: Journey, size: Size) {
  const { page, step, expect } = j
  if (size) await page.setViewportSize(size)
  const { soft, done } = softer()
  const base = await baselineFoot(j)
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('region', { name: 'At the platforms now' })).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await settle(page, panel)
  await step('stop link, none standing, at its peek')
  await soft(() => tabsAtPeek(page, panel, expect, 'none standing link'))
  await soft(() => footCheck(page, expect, 'none standing link'))
  await realTap(page, panel.getByRole('button', { name: 'Close' }), 'Nørreport St.', [])
  await expect(panel).toBeHidden()
  await page.waitForTimeout(800)
  const after = await soft(() => footCheck(page, expect, 'stop closed'))
  await step('stop closed, foot back')
  await soft(async () => expect(Math.abs((after as any).credit.bottom - base.credit.bottom), 'foot back to baseline after close').toBeLessThan(1))
  done()
}

// P3: København H on the crowded recording, six standing: the tablist on screen at the peek.
export async function crowdedLink(j: Journey, size: Size) {
  const { page, step, expect } = j
  if (size) await page.setViewportSize(size)
  const { soft, done } = softer()
  await baselineFoot(j)
  await page.goto('/en?stop=8600626')
  const panel = page.getByRole('dialog', { name: 'København H' })
  await expect(panel).toBeVisible()
  const list = panel.getByRole('list', { name: 'At the platforms now' })
  await expect(list.getByRole('listitem')).toHaveCount(6)
  await expect(panel.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
  await settle(page, panel)
  await step('København H, six standing, at its peek')
  await soft(() => tabsAtPeek(page, panel, expect, 'crowded link'))
  await soft(() => footCheck(page, expect, 'crowded link'))
  done()
}

// C1: a tap on the map, Overview open, Bus hidden: none standing; the Bus chip brings the 991's card;
// a drag to full height and back; Close. Tabs and foot checked in each state.
export async function mapTapFilter(j: Journey, size: Size) {
  const { page, step, expect } = j
  if (size) await page.setViewportSize(size)
  const { soft, done } = softer()
  const base = await baselineFoot(j, '/en?hide=bus&map=17.00/55.69105/12.60675')
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(async () => {
    await page.touchscreen.tap(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30000 })
  await expect(page.getByRole('dialog', { name: 'Overview' })).toBeAttached()
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await settle(page, panel)
  await step('map tap, Overview open, none standing (Bus hidden)')
  await soft(() => tabsAtPeek(page, panel, expect, 'map tap, none standing'))
  await soft(() => footCheck(page, expect, 'map tap, none standing'))
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).tap()
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await settle(page, panel)
  await step('Bus shown: 991 card appears')
  const peek = await soft(() => tabsAtPeek(page, panel, expect, 'after Bus filter, standing'))
  await soft(() => footCheck(page, expect, 'after Bus filter, standing'))
  const peekTop = (await panel.boundingBox())!.y
  await drag(page, panel.getByRole('heading', { name: 'Refshaleøen' }), -700)
  await settle(page, panel)
  const full = (await panel.boundingBox())!.y
  log('FULL top', full, 'peekTop', peekTop)
  await soft(async () => expect(full, 'sheet raised to full height').toBeLessThan(120))
  await step('sheet dragged to full height')
  // the header sits under the top bar at full height, so the finger takes the tablist, slowly
  const tlb = (await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox())!
  await fingerDrag(page, tlb.x + tlb.width - 40, tlb.y + tlb.height / 2, peekTop - full)
  await settle(page, panel)
  const back = (await panel.boundingBox())!.y
  log('BACK top', back)
  await step('sheet dragged back to its peek')
  await soft(async () => expect(Math.abs(back - peekTop), 'back at the same peek').toBeLessThan(2))
  await soft(() => tabsAtPeek(page, panel, expect, 'dragged back to peek'))
  await soft(() => footCheck(page, expect, 'dragged back to peek'))
  await realTap(page, panel.getByRole('button', { name: 'Close' }), 'Refshaleøen', [])
  await expect(panel).toBeHidden()
  await page.waitForTimeout(800)
  const after = await soft(() => footCheck(page, expect, 'stop closed'))
  await step('stop closed, foot back')
  await soft(async () => expect(Math.abs((after as any).credit.bottom - base.credit.bottom), 'foot back to baseline after close').toBeLessThan(1))
  void peek
  done()
}

// C2: a held drag while a trip comes to stand (the Bus chip pressed by script while the finger holds):
// the sheet stays under the finger; on release it settles on the taller peek with the tabs on screen.
export async function heldDragFilter(j: Journey, size: Size) {
  const { page, step, expect } = j
  if (size) await page.setViewportSize(size)
  const { soft, done } = softer()
  await page.goto('/en?hide=bus&stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await settle(page, panel)
  const t0 = (await panel.boundingBox())!.y
  await step('Bus hidden, none standing, at its peek')
  const d = await holdDrag(page, panel.getByRole('heading', { name: 'Refshaleøen' }), -30)
  await page.waitForTimeout(400)
  const held = (await panel.boundingBox())!.y
  log('t0', t0, 'held', held)
  await step('finger holding the sheet 30 px up')
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).evaluate((b: HTMLElement) => b.click())
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  const samples: number[] = []
  for (let i = 0; i < 15; i++) {
    samples.push(Math.round((await panel.boundingBox())!.y * 10) / 10)
    await page.waitForTimeout(100)
  }
  log('HELD samples', samples)
  await step('991 standing while the finger still holds')
  await soft(async () => expect(Math.max(...samples.map((s) => Math.abs(s - held))), 'sheet stays under the finger').toBeLessThan(3))
  await d.release()
  await settle(page, panel)
  const after = (await panel.boundingBox())!.y
  log('after release', after)
  await step('released: sheet settles')
  await soft(() => tabsAtPeek(page, panel, expect, 'after held drag released'))
  await soft(() => footCheck(page, expect, 'after held drag released'))
  done()
}
