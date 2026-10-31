import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 2: Show whole line on a tilted, turned map fits the trip's pattern and keeps the tilt
// and heading.
const KEY = 'metro.M1.c6fa766489.20260616.0705'

export default async ({ page, step, expect }: Journey) => {
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  const trip = snapshot.trips.find((t: { key: string }) => t.key === KEY)
  if (!trip) throw new Error(`precondition: ${KEY} is not in /api/snapshot`)
  const [lat, lon] = trip.position
  await page.goto(`/en?map=14.00/${lat.toFixed(5)}/${lon.toFixed(5)}/-30.0/50.0&trip=${KEY}`)
  const cam = page.locator('[data-vehicles]')
  await expect(cam).toHaveAttribute('data-tilt', '50', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-heading', '-30')
  const panel = page.getByRole('dialog', { name: /to Vanløse St\./ })
  await expect(panel).toBeVisible()
  await step('tilted turned map with the M1 panel open')

  await panel.getByRole('button', { name: 'Show whole line' }).click()
  await expect(page.getByRole('button', { name: 'Showing: line M1 · Clear' })).toBeVisible()
  const zoom = () => Number((new URL(page.url()).searchParams.get('map') ?? '99').split('/')[0])
  await expect.poll(zoom, { timeout: 20_000 }).toBeLessThan(14)
  await page.waitForTimeout(3_000)
  const map = new URL(page.url()).searchParams.get('map')
  console.log('address map=', map)
  await step('whole line fitted')
  expect(map).toMatch(/\/-30\.0\/50\.0$/)
  await expect(cam).toHaveAttribute('data-tilt', '50')
  await expect(cam).toHaveAttribute('data-heading', '-30')

  // The same with the panel closed: the line stays highlighted and the view is unchanged.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.waitForTimeout(1_500)
  await step('panel closed, whole line still fitted')
}
