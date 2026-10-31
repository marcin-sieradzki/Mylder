import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints, falseNows, summary, rowHistory, fetchedAt } from './paints.ts'
// stop-standing-phone (run with --phone), rerun: the tablist-at-peek clause logged, not asserted, so the rest of the recipe is driven: Refshaleøen with buses hidden, close the Overview, tap the stop, show buses ->
// one sideways row of cards above the tabs at the sheet's peek; the 991's card never reads "Now" unless it does once settled.
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  const fetched = await fetchedAt(page)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  if (fetched >= Date.parse('2026-06-16T05:22:40Z')) throw new Error('Precondition missed: recording at ' + new Date(fetched).toISOString() + ', the 991 leaves Refshaleøen about 07:23')
  await page.goto('/en?hide=bus&map=17.00/55.69105/12.60675')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map at Refshaleøen, buses hidden')
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: 'Close' }).click()
  await step('Overview closed')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(async () => {
    const v = page.viewportSize()!
    await page.mouse.click(v.width / 2, v.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 30000 })
  await expect(panel).toHaveAttribute('data-anchor', 'bottom')
  await expect(page).toHaveURL(/[?&]stop=48645/)
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await step('Refshaleøen sheet, buses hidden: none standing')
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()
  const list = region.getByRole('list', { name: 'At the platforms now' })
  await expect(list).toBeVisible()
  const cards = list.getByRole('listitem')
  await expect(cards).toHaveCount(1)
  const card = cards.first()
  for (const t of ['991', 'Teglholmen', 'Estimated', '~07:23']) await expect(card).toContainText(t)
  await expect(card).toContainText(/\d+ min|Now/)
  expect(await list.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')
  const lb = (await list.boundingBox())!, cb = (await card.boundingBox())!, tb = (await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox())!
  const vh = page.viewportSize()!.height
  console.log('list', JSON.stringify(lb), 'card', JSON.stringify(cb), 'tablist', JSON.stringify(tb), 'viewport h', vh)
  expect(cb.width).toBeLessThan(lb.width)
  expect(lb.y + lb.height).toBeLessThanOrEqual(tb.y)
  expect(lb.y + lb.height).toBeLessThanOrEqual(vh)
  console.log('tablist top inside the viewport at the peek:', tb.y < vh, '(' + tb.y + ' vs ' + vh + ')')
  console.log('CARD:', (await card.innerText()).replace(/\n/g, ' | '))
  await step('buses shown: one sideways card above the tabs')
  const all = await paints(page)
  console.log(`PAINTS (${all.length}):\n` + summary(all))
  console.log('STANDING ROW HISTORY:\n' + rowHistory(all, /^At the platforms now$/).join('\n'))
  expect(falseNows(all, all[all.length - 1]), 'rows reading Now that do not once settled').toEqual([])
  await card.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  expect(page.url()).not.toMatch(/[?&]stop=/)
  await step('vehicle opened from the card')
}
