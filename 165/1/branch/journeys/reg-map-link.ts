import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Regression, moving-map map-3d: a tilted link, keys to the address, a reload, out-of-range tilt.
export default async ({ page, step, expect }: Journey) => {
  const cam = page.locator('[data-vehicles]')
  const scale = page.getByText(/\d+\s(m|km)$/)
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/50.0')
  await expect(cam).toHaveAttribute('data-tilt', '50', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-heading', '-30')
  await expect(scale).toBeHidden()
  await step('tilted link')
  await page.goto('/en?map=13.00/55.67600/12.56800')
  await expect(cam).toHaveAttribute('data-tilt', '0', { timeout: 20_000 })
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (const key of ['Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowRight', 'Shift+ArrowRight']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(500)
  }
  await expect(cam).toHaveAttribute('data-tilt', '20', { timeout: 10_000 })
  await expect(cam).toHaveAttribute('data-heading', '30', { timeout: 10_000 })
  await expect(page).toHaveURL(/map=13\.00\/55\.67600\/12\.56800\/30\.0\/20\.0/)
  await step('keys wrote the angle to the address')
  await page.reload()
  await expect(cam).toHaveAttribute('data-tilt', '20', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-heading', '30')
  await step('reloaded at the same angle')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect.poll(() => (new URL(page.url()).searchParams.get('map') ?? '').split('/').length, { timeout: 10_000 }).toBe(3)
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/75.0')
  await expect(cam).toHaveAttribute('data-heading', '-30', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-tilt', '0')
  await step('out-of-range tilt opens flat')
}
