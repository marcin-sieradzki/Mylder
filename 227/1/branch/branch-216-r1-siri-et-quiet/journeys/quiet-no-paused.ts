import { type Journey, untilQuiet } from './lib.ts'
const BANNER = "Timetable and delays: live positions aren't connected yet, so each vehicle is placed from its timetable and, where Rejseplanen has sent one, its delay."
export default async ({ page, step, expect }: Journey) => {
  await untilQuiet(page, 120_000)
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  const outside = page.getByRole('status').filter({ hasNot: page.getByRole('dialog') })
  await expect(page.getByRole('status').first()).toContainText(BANNER)
  const statuses = await page.getByRole('status').allInnerTexts()
  console.log('statuses', JSON.stringify(statuses))
  for (const s of statuses) expect(s).not.toMatch(/paused|hasn't answered|No answer/i)
  await expect(page.getByText(/paused/i)).toHaveCount(0)
  console.log('legend', JSON.stringify(await page.getByRole('list', { name: 'Data states' }).locator('..').innerText()))
  await step('map quiet: banner unchanged, no paused notice')
  void outside
}
