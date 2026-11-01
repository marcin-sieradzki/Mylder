import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
// Pass rule: on the timetable source, open About -> its source is Rejseplanen's timetable with no
// live positions yet, the note says positions are the timetable's plan (not "not real"), and it
// credits Rejseplanen under CC BY 4.0 with the deployed timetable's version date.
const t = L.da
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/da')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  await step('map')
  await page.getByRole('button', { name: t.about }).click()
  const d = page.getByRole('dialog', { name: t.about })
  await expect(d).toBeVisible()
  await step('about open')
  const text = await d.innerText()
  dump('about', text)
  const snap = await (await page.request.get('/api/snapshot')).json()
  const prepared = snap.status.timetable.prepared
  dump('prepared', { prepared, shown: t.date(prepared) })
  expect(text).toMatch(t.source)
  expect(text).toMatch(t.note)
  expect(text).not.toMatch(t.notReal)
  expect(text).toMatch(t.credit(t.date(prepared)))
  expect(text).toMatch(t.legend)
  expect(text).toMatch(t.positions)
  expect(text).toMatch(t.calls)
  await d.getByText(t.credit(t.date(prepared))).scrollIntoViewIfNeeded()
  await step('credit')
  await page.keyboard.press('Escape')
  await expect(d).toBeHidden()
  await step('about closed')
}
