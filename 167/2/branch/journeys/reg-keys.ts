import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, region } from './lib.ts'

// Regression, moving-map map-3d "Tilt and turn by keys": three Shift + Up and two Shift + Right
// (page.keyboard.press, back to back), tilt 30, heading 30, scale bar hidden, every dot drawn;
// Centre the map brings it back flat and north-up.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  const v = page.locator('[data-vehicles]')
  const scale = page.getByText(/\d+\s(m|km)$/)
  await expect(scale).toBeVisible()
  await step('flat')
  await region(page).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(v).toHaveAttribute('data-tilt', '30', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-heading', '30', { timeout: 15000 })
  await expect(scale).toBeHidden()
  const drawn = (await (await page.request.get('/api/snapshot')).json()).trips.filter((t: any) => t.state !== 'cancelled').length
  await expect(v).toHaveAttribute('data-vehicles', String(drawn))
  await page.waitForTimeout(2000)
  await expect(v).toHaveAttribute('data-tilt', '30')
  await expect(v).toHaveAttribute('data-heading', '30')
  await step('tilted 30, turned 30')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(v).toHaveAttribute('data-tilt', '0', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-heading', '0', { timeout: 15000 })
  await expect(scale).toBeVisible()
  await page.waitForTimeout(1500)
  await step('back flat and north-up')
}
