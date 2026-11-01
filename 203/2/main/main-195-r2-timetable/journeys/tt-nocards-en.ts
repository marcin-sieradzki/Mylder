import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
const t = L.en
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const sheet = page.getByRole('dialog', { name: t.overview })
  await expect(sheet).toBeVisible()
  await step('city pulse')
  const pulse = await sheet.innerText()
  dump('pulse', pulse)
  const tabs = await sheet.getByRole('tab').allInnerTexts()
  dump('tabs', tabs)
  await sheet.getByRole('tab').nth(2).click()
  await expect(page).toHaveURL(/tab=disruptions/)
  await page.waitForTimeout(1500)
  await step('disruptions tab')
  const dis = await sheet.innerText()
  dump('disruptions', dis)
  const body = await page.locator('body').innerText()
  expect(dis).not.toMatch(t.cards)
  expect(body).not.toMatch(t.paused)
  // a minute and a poll later
  await page.waitForTimeout(65000)
  await step('disruptions a poll later')
  const dis2 = await sheet.innerText()
  dump('disruptions-later', dis2)
  expect(dis2).not.toMatch(t.cards)
  expect(await page.locator('body').innerText()).not.toMatch(t.paused)
}
