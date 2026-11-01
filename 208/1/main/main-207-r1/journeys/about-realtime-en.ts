import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: on the timetable source, a rider opens About and the "Rejseplanen's realtime" fact
// says there is no realtime connection yet, never "Unknown" or "—".
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await expect(page.getByText("Timetable only: live positions aren't connected yet", { exact: false }).first()).toBeVisible()
  await step('map loaded on the timetable source')
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toBeVisible()
  const fact = about.locator("xpath=.//dt[normalize-space()=\"Rejseplanen's realtime\"]/following-sibling::dd[1]")
  await fact.scrollIntoViewIfNeeded()
  await step('About open, This page facts')
  const value = (await fact.innerText()).trim()
  console.log(`Rejseplanen's realtime: ${value}`)
  expect(value).not.toMatch(/Unknown|^—/)
  await expect(fact).toHaveText('Not connected yet')
  await expect(about.locator("xpath=.//dt[normalize-space()='Source']/following-sibling::dd[1]")).toHaveText("Rejseplanen's timetable, no live positions yet")
  await expect(about.getByText('Unknown', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()
  await step('About closed')
}
