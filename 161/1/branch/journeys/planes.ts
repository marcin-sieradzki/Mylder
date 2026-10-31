import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Regression, planes: planes-draw, planes-filter, planes-credit (planes-card is in plane-track).
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft'))).toBeGreaterThan(0)
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Planes/ })
  await expect(chip).toContainText(/\d/)
  await expect(page.getByRole('link', { name: '© adsb.lol contributors' })).toBeVisible()
  await step('planes drawn')
  await chip.click()
  // With Planes off the map draws none: [data-aircraft] reads 0 or is gone (it is gone on main too).
  await expect.poll(async () => Number((await page.locator('[data-aircraft]').getAttribute('data-aircraft', { timeout: 500 }).catch(() => null)) ?? 0)).toBe(0)
  await step('planes off')
  await chip.click()
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft'))).toBeGreaterThan(0)
  await step('planes back')
}
