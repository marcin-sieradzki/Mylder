import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
const t = L.en
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  await expect(page.getByRole('banner').getByText(new RegExp('^' + t.updated + ' \\d\\d:\\d\\d:\\d\\d$'))).toBeVisible()
  await page.waitForTimeout(5000)
  await step('map on the timetable source')
  const statuses = []
  for (const s of await page.getByRole('status').all()) {
    if (!(await s.isVisible())) continue
    if (await s.evaluate((el) => !!el.closest('[role=dialog]'))) continue
    statuses.push(await s.innerText())
  }
  dump('statuses', statuses)
  const overview = await page.getByRole('dialog', { name: t.overview }).innerText()
  const body = (await page.locator('body').innerText()).replace(overview, '')
  dump('body', body)
  const n = await page.locator('[data-vehicles]').getAttribute('data-vehicles')
  dump('vehicles', n ?? '')
  expect(statuses.filter((s) => s.trim() !== '')).toHaveLength(1)
  expect(statuses[0].replace(/\n/g, ' ')).toMatch(t.banner)
  expect(body).not.toMatch(t.paused)
}
