import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule: open the map → it is flat and north-up, every vehicle and plane drawn, the address keeps the three-part map=zoom/lat/lon.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(snap.trips.length))
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft'))).toBeGreaterThan(0)
  await step('map open')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page).toHaveURL(/[?&]map=\d+(\.\d+)?\/\d+\.\d+\/\d+\.\d+(&|$)/)
  await step('zoomed in')
  console.log('url', page.url())
}
