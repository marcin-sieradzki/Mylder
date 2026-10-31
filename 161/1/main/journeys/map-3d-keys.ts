import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, region, sleep } from './lib.ts'
// Regression, moving-map map-3d: tilt and turn by keys, scale bar hidden, every dot drawn, Centre the map resets.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  const scale = page.getByText(/\d+\s(m|km)$/)
  await expect(scale).toBeVisible()
  await step('flat')
  await region(page).focus()
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+ArrowUp'); await sleep(600) }
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Shift+ArrowRight'); await sleep(600) }
  const v = page.locator('[data-vehicles]')
  await expect(v).toHaveAttribute('data-tilt', '30', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-heading', '30', { timeout: 15000 })
  await expect(scale).toBeHidden()
  const live = (await (await page.request.get('/api/snapshot')).json()).trips.filter((t: any) => t.state !== 'cancelled').length
  await expect(v).toHaveAttribute('data-vehicles', String(live))
  await sleep(3000)
  await step('tilted 30, turned 30')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(v).toHaveAttribute('data-tilt', '0', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-heading', '0', { timeout: 15000 })
  await expect(scale).toBeVisible()
  await sleep(2000)
  await step('back flat and north-up')
}
