import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rules 1, 2 (bus card), 3 (empty text with buses hidden): phone, Refshaleøen from the map.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?hide=bus&map=17.00/55.69105/12.60675')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map at Refshaleøen, buses hidden')
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: 'Close' }).click()
  await step('overview closed')
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(async () => {
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 20000 })
  await expect(panel).toHaveAttribute('data-anchor', 'bottom')
  await expect(page).toHaveURL(/[?&]stop=48645/)
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toBeVisible()
  await step('stop sheet open, buses hidden')
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await expect(region.getByRole('list')).toHaveCount(0)
  const tablist = panel.getByRole('tablist', { name: 'Departures and arrivals' })
  const rb0 = (await region.boundingBox())!
  const tb0 = (await tablist.boundingBox())!
  expect(rb0.y + rb0.height).toBeLessThanOrEqual(tb0.y + 1)
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()
  const list = region.getByRole('list', { name: 'At the platforms now' })
  await expect(list).toBeVisible()
  await step('buses shown: standing row')
  const overflowX = await list.evaluate((el) => getComputedStyle(el).overflowX)
  expect(overflowX).toBe('auto')
  const items = list.getByRole('listitem')
  await expect(items).toHaveCount(1)
  const card = items.first()
  for (const t of ['991', 'Teglholmen', 'Estimated', '~07:23']) await expect(card).toContainText(t)
  await expect(card).toContainText(/Now|\d+\s*min/)
  const lb = (await list.boundingBox())!
  const cb = (await card.boundingBox())!
  console.log(`list ${JSON.stringify(lb)} card ${JSON.stringify(cb)} viewport ${JSON.stringify(vp)}`)
  expect(cb.width).toBeLessThan(lb.width)
  // a row: items laid out horizontally (flex row / grid columns)
  const dir = await list.evaluate((el) => { const s = getComputedStyle(el); return `${s.display} ${s.flexDirection} ${s.gridAutoFlow}` })
  console.log(`list layout: ${dir}`)
  expect(/flex row|grid \S+ column/.test(dir) || /^flex\s+row/.test(dir), 'the standing trips laid out in one row').toBe(true)
  await expect(region.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
  const tb = (await tablist.boundingBox())!
  expect(lb.y + lb.height).toBeLessThanOrEqual(tb.y + 1)
  // at the peek: the card and the tablist's top are in the viewport
  expect(cb.y).toBeGreaterThanOrEqual(0)
  expect(cb.y + cb.height).toBeLessThanOrEqual(vp.height)
  console.log(`tablist top ${tb.y}, viewport height ${vp.height}: tabs ${tb.y < vp.height ? 'start inside' : 'start below'} the peek`)
  const btn = card.getByRole('button', { name: 'Bus 991 to Teglholmen' })
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  await expect(page).not.toHaveURL(/[?&]stop=/)
  await step('vehicle open from the card')
}
