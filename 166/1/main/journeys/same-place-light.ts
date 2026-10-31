import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule (side by side with main): in light theme at zoom 16 and 60°, where line paths and
// stops run behind blocks, the street grid reads through the blocks and the lines and stops draw
// over them. Two fixed places, Overview closed and dots paused.
export default async ({ page, step, expect }: Journey) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const map = page.locator('[data-vehicles]')
  for (const [name, link] of [
    ['noerre voldgade', '16.00/55.68000/12.57000/-30.0/60.0'],
    ['bernstorffsgade', '16.00/55.67073/12.57374/-30.0/60.0'],
    ['noerreport', '16.00/55.68300/12.57100/0.0/60.0'],
  ]) {
    await page.goto(`/en?map=${link}`)
    await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'Close' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Overview' })).toBeHidden()
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(map).toHaveAttribute('data-tilt', '60', { timeout: 30000 })
    await page.waitForTimeout(15000)
    await step(`${name} light`)
  }
}
