import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
const t = L.en
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  await step('map')
  await page.getByRole('button', { name: t.about }).click()
  const d = page.getByRole('dialog', { name: t.about })
  await expect(d).toBeVisible()
  await step('about open')
  const text = await d.innerText()
  dump('about', text)
  const snap = await (await page.request.get('/api/snapshot')).json()
  dump('prepared', snap.status.timetable.prepared)
  expect(text).toMatch(t.source)
  expect(text).toMatch(t.note)
  expect(text).not.toMatch(t.notReal)
  expect(text).toMatch(t.credit)
  await d.getByText(t.credit).scrollIntoViewIfNeeded()
  await step('credit')
  await page.keyboard.press('Escape')
  await expect(d).toBeHidden()
}
