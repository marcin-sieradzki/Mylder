import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: on the timetable source in Danish, a rider opens Om Mylder and "Rejseplanens realtid"
// says there is no realtime connection yet, never "Ukendt" or "—".
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/da')
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(page.getByRole('banner').getByText(/^Opdateret /)).toBeVisible()
  await step('map loaded in Danish on the timetable source')
  await page.getByRole('button', { name: 'Om Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'Om Mylder' })
  await expect(about).toBeVisible()
  const fact = about.locator("xpath=.//dt[normalize-space()='Rejseplanens realtid']/following-sibling::dd[1]")
  await fact.scrollIntoViewIfNeeded()
  await step('Om Mylder open, Denne side facts')
  const value = (await fact.innerText()).trim()
  console.log(`Rejseplanens realtid: ${value}`)
  expect(value).not.toMatch(/Ukendt|Unknown|^—/)
  await expect(fact).toHaveText('Ikke koblet på endnu')
  await expect(about.locator("xpath=.//dt[normalize-space()='Kilde']/following-sibling::dd[1]")).toHaveText('Rejseplanens køreplan, endnu ingen livepositioner')
  await expect(about.getByText('Ukendt', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()
  await step('Om Mylder closed')
}
