import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, viewportMiddle, around } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?map=15.00/55.69250/12.58779')
  await ready(page, expect)
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  const { x, y } = viewportMiddle(page)
  for (const q of around(x, y, 8, 4)) {
    await page.mouse.click(q.x, q.y)
    await page.waitForTimeout(400)
    if (await panel.isVisible()) break
  }
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(/stop=/)
  const first = panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()
  await expect(first).toBeVisible()
  await step('Østerport St. from the map')
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page.getByRole('dialog', { name: 'Østerport St.' }).getByRole('list', { name: 'Afgange' })).toBeVisible()
  await step('Danish: panel stays, Afgange')
  await page.goto('/en?stop=nowhere')
  await expect(page.getByRole('dialog', { name: 'Stop not found' })).toBeVisible()
  await step('stop not found')
}
