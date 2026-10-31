import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 4: flat and north-up, Follow and both fits behave as today.
const KEY = 'metro.M1.c6fa766489.20260616.0705'

export default async ({ page, step, expect }: Journey) => {
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  const trip = snapshot.trips.find((t: { key: string }) => t.key === KEY)
  if (!trip) throw new Error(`precondition: ${KEY} is not in /api/snapshot`)
  const [lat, lon] = trip.position
  const mapParam = () => new URL(page.url()).searchParams.get('map') ?? ''
  const cam = page.locator('[data-vehicles]')
  const { width, height } = page.viewportSize()!

  await page.goto(`/en?map=14.00/${lat.toFixed(5)}/${lon.toFixed(5)}&trip=${KEY}`)
  await expect(cam).toHaveAttribute('data-tilt', '0', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-heading', '0')
  const panel = page.getByRole('dialog', { name: /to Vanløse St\./ })
  await expect(panel).toBeVisible()
  await step('flat map with the M1 panel open')

  const follow = panel.getByRole('button', { name: 'Follow' })
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  for (const [i, wait] of [1_000, 4_000].entries()) {
    await page.waitForTimeout(wait)
    await expect(async () => {
      await page.mouse.move(width / 2 + (i % 2 === 0 ? 1 : -1), height / 2)
      await page.mouse.move(width / 2 + (i % 2 === 0 ? 2 : -2), height / 2)
      await expect(page.getByRole('tooltip')).toContainText('M1 to Vanløse St.', { timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await expect(cam).toHaveAttribute('data-tilt', '0')
    await expect(cam).toHaveAttribute('data-heading', '0')
    await step(`following flat ${i}`)
  }
  // A pan ends Follow.
  await page.mouse.move(width / 2 - 100, height / 2 + 150)
  await page.mouse.down()
  for (let s = 1; s <= 10; s++) {
    await page.mouse.move(width / 2 - 100 + s * 20, height / 2 + 150)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  await step('pan ended follow')

  await panel.getByRole('button', { name: 'Show whole line' }).click()
  await expect(page.getByRole('button', { name: 'Showing: line M1 · Clear' })).toBeVisible()
  await expect.poll(() => Number(mapParam().split('/')[0]), { timeout: 20_000 }).toBeLessThan(14)
  await page.waitForTimeout(3_000)
  console.log('flat line map=', mapParam())
  expect(mapParam().split('/')).toHaveLength(3)
  await expect(cam).toHaveAttribute('data-tilt', '0')
  await expect(cam).toHaveAttribute('data-heading', '0')
  await step('flat whole line fitted')

  await page.goto('/en?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await sheet
    .getByRole('listitem')
    .filter({ hasText: 'Færre S-tog mellem København H og Hellerup' })
    .getByRole('button', { name: 'Show on map' })
    .click()
  const chip1 = page.getByRole('button', {
    name: 'Showing: Færre S-tog mellem København H og Hellerup · Clear',
  })
  await expect(chip1).toBeVisible()
  await expect.poll(mapParam, { timeout: 20_000 }).toMatch(/^\d/)
  await page.waitForTimeout(3_000)
  console.log('flat stretch map=', mapParam())
  expect(mapParam().split('/')).toHaveLength(3)
  await step('flat stretch fitted')
  await chip1.click()
  await expect(chip1).toBeHidden()

  await sheet
    .getByRole('listitem')
    .filter({ hasText: 'Linje 5C kører en anden rute ved Langebro' })
    .getByRole('button', { name: 'Show on map' })
    .click()
  await expect(page.getByRole('button', { name: /^Showing: Linje 5C/ })).toBeVisible()
  await expect.poll(mapParam, { timeout: 20_000 }).toMatch(/^15\.00\//)
  await page.waitForTimeout(2_000)
  expect(mapParam().split('/')).toHaveLength(3)
  await step('flat Klaksvigsgade ring fitted')
  const notice = (await page.getByRole('status').filter({ hasText: 'Recorded data' }).boundingBox())!
  const legend = (await page.getByRole('list', { name: 'Data states' }).locator('..').boundingBox())!
  const top = Math.max(146, notice.y + notice.height + 42 + 24)
  const bottom = Math.max(48, height - legend.y + 24)
  const centre = { x: 412 + (width - 412 - 400) / 2, y: top + (height - top - bottom) / 2 }
  const stop = page.getByRole('dialog', { name: 'Klaksvigsgade' })
  await expect(async () => {
    await page.mouse.click(centre.x, centre.y)
    await expect(stop).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await step('flat ring tapped: Klaksvigsgade departures')
}
