import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { fetchedAt } from './paints.ts'
// stop-standing-phone, train with a track (run with --phone): København Syd St. from 07:22 -> the row holds RE, Næstved St., Track 8.
export default async ({ page, step, expect }: Journey) => {
  await expect.poll(() => fetchedAt(page), { timeout: 200000, intervals: [1000] }).toBeGreaterThanOrEqual(Date.parse('2026-06-16T05:22:00Z'))
  const fetched = await fetchedAt(page)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  if (fetched >= Date.parse('2026-06-16T05:22:50Z')) throw new Error('Precondition missed: recording at ' + new Date(fetched).toISOString())
  await page.goto('/en?map=17.00/55.65263/12.51685')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map at København Syd St.')
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: 'Close' }).click()
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(async () => {
    const v = page.viewportSize()!
    await page.mouse.click(v.width / 2, v.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 30000 })
  const list = panel.getByRole('region', { name: 'At the platforms now' }).getByRole('list', { name: 'At the platforms now' })
  const card = list.getByRole('listitem').filter({ hasText: 'Næstved St.' }).first()
  await expect(card).toContainText('RE')
  await expect(card).toContainText('Track 8')
  expect(await list.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')
  console.log('CARD:', (await card.innerText()).replace(/\n/g, ' | '))
  await step('RE to Næstved St. card on Track 8')
}
