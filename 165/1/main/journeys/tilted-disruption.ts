import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 3: Show on map on a disruption, on a tilted, turned map, fits the disruption and
// keeps the tilt and heading.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?tab=disruptions&map=13.00/55.67000/12.57000/-30.0/50.0')
  const cam = page.locator('[data-vehicles]')
  await expect(cam).toHaveAttribute('data-tilt', '50', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-heading', '-30')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet.getByRole('list', { name: 'Active now' })).toBeVisible()
  await step('tilted turned map with the Disruptions tab')

  const mapParam = () => new URL(page.url()).searchParams.get('map') ?? ''

  // The S-tog stretch from København H to Hellerup.
  await sheet
    .getByRole('listitem')
    .filter({ hasText: 'Færre S-tog mellem København H og Hellerup' })
    .getByRole('button', { name: 'Show on map' })
    .click()
  const chip1 = page.getByRole('button', {
    name: 'Showing: Færre S-tog mellem København H og Hellerup · Clear',
  })
  await expect(chip1).toBeVisible()
  await expect.poll(mapParam, { timeout: 20_000 }).not.toMatch(/^13\.00\/55\.67000\/12\.57000/)
  await page.waitForTimeout(3_000)
  console.log('stretch map=', mapParam())
  await step('S-tog stretch fitted')
  expect(mapParam()).toMatch(/\/-30\.0\/50\.0$/)
  await expect(cam).toHaveAttribute('data-tilt', '50')
  await expect(cam).toHaveAttribute('data-heading', '-30')
  await chip1.click()
  await expect(chip1).toBeHidden()
  await step('stretch cleared')

  // The 5C diversion: one ring at Klaksvigsgade.
  await sheet
    .getByRole('listitem')
    .filter({ hasText: 'Linje 5C kører en anden rute ved Langebro' })
    .getByRole('button', { name: 'Show on map' })
    .click()
  await expect(page.getByRole('button', { name: /^Showing: Linje 5C/ })).toBeVisible()
  await expect.poll(mapParam, { timeout: 20_000 }).toMatch(/^15\.00\//)
  await page.waitForTimeout(3_000)
  console.log('5C map=', mapParam())
  await step('Klaksvigsgade ring fitted')
  expect(mapParam()).toMatch(/\/-30\.0\/50\.0$/)
  await expect(cam).toHaveAttribute('data-tilt', '50')
  await expect(cam).toHaveAttribute('data-heading', '-30')

  const { width, height } = page.viewportSize()!
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
  await step('ring tapped: Klaksvigsgade departures')
}
