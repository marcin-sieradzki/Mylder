import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 2 (track): phone, København Syd St. from the map, 07:22-07:23 on the recording.
export default async ({ page, step, expect }: Journey) => {
  const t22 = Date.UTC(2026, 5, 16, 5, 22)
  await expect.poll(async () => Number((await (await page.request.get('/api/snapshot')).json()).fetched), { timeout: 150000, intervals: [1000] }).toBeGreaterThanOrEqual(t22)
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched ' + new Date(fetched).toISOString())
  expect(fetched, 'the RE stands at København Syd only until 07:23 on the recording').toBeLessThan(t22 + 60000)
  await page.goto('/en?map=17.00/55.65263/12.51685')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map at København Syd')
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: 'Close' }).click()
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(async () => {
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 20000 })
  const list = panel.getByRole('region', { name: 'At the platforms now' }).getByRole('list', { name: 'At the platforms now' })
  await expect(list).toBeVisible()
  await step('stop sheet open')
  const card = list.getByRole('listitem').filter({ hasText: 'Næstved St.' })
  await expect(card).toHaveCount(1)
  for (const t of ['RE', 'Næstved St.', 'Track 8']) await expect(card).toContainText(t)
  await expect(card).toContainText(/07:2\d/)
  expect(await list.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')
  const tb = (await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox())!
  const lb = (await list.boundingBox())!
  expect(lb.y + lb.height).toBeLessThanOrEqual(tb.y + 1)
  await step('RE to Næstved, Track 8')
}
