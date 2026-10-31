import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Regression, moving map: a tilted link, a reload, and an out-of-range tilt.
export default async ({ page, step, expect }: Journey) => {
  const map = page.locator('[data-vehicles]')
  const scale = page.getByText(/\d+\s(m|km)$/)
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/50.0')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await expect(map).toHaveAttribute('data-tilt', '50', { timeout: 20000 })
  await expect(map).toHaveAttribute('data-heading', '-30')
  await expect(scale).toBeHidden()
  const snap = await (await page.request.get('/api/snapshot')).json()
  await expect(map).toHaveAttribute('data-vehicles', String(snap.trips.filter((t: { cancelled?: boolean }) => !t.cancelled).length))
  await page.waitForTimeout(8000)
  await step('tilted link')
  if ((page.viewportSize()?.width ?? 1000) < 600) return
  await page.goto('/en?map=13.00/55.67600/12.56800')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (const key of ['Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowRight', 'Shift+ArrowRight']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(500)
  }
  await expect(map).toHaveAttribute('data-tilt', '20', { timeout: 15000 })
  await expect(map).toHaveAttribute('data-heading', '30', { timeout: 15000 })
  await expect(page).toHaveURL(/map=13\.00\/55\.67600\/12\.56800\/30\.0\/20\.0/, { timeout: 10000 })
  await step('tilted by keys')
  await page.reload()
  await expect(map).toHaveAttribute('data-tilt', '20', { timeout: 20000 })
  await expect(map).toHaveAttribute('data-heading', '30')
  await step('reloaded')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(page).toHaveURL(/map=\d+\.\d\d\/[\d.]+\/[\d.]+$/, { timeout: 15000 })
  await step('centred')
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/75.0')
  await expect(map).toHaveAttribute('data-heading', '-30', { timeout: 20000 })
  await expect(map).toHaveAttribute('data-tilt', '0')
  await expect(map).toHaveAttribute('data-vehicles', /^\d+$/)
  await step('out of range tilt')
}
