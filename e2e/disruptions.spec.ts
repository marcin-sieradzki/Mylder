import type { Page } from '@playwright/test'
import { expect, test } from './recording'

// The Disruptions tab on the weekday recording: its `himsearch` answer's three messages, at
// 07:20 on Tuesday 16 June 2026, and Show on map, which fits the camera to a message's stretch
// and stops, flat or at the tilt and heading the rider left the map at.

test("the Disruptions tab lists the recording's messages, active first", async ({ page }) => {
  await page.goto('/en?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  const active = sheet.getByRole('list', { name: 'Active now' })
  await expect(active.getByText('Færre S-tog mellem København H og Hellerup')).toBeVisible()
  await expect(active.getByText('Linje 5C kører en anden rute ved Langebro')).toBeVisible()
  await expect(
    sheet
      .getByRole('list', { name: 'Later' })
      .getByText('Ingen S-tog mellem Hellerup og Holte i weekenden'),
  ).toBeVisible()
  await expect(sheet.getByText('Messages from Rejseplanen, checked 07:20.')).toBeVisible()
})

test('in Danish, on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/da?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overblik' })
  const active = sheet.getByRole('list', { name: 'Aktuelle nu' })
  await expect(active.getByText('Færre S-tog mellem København H og Hellerup')).toBeAttached()
  await expect(sheet.getByRole('tab', { name: /^Driftsforstyrrelser/ })).toHaveText(
    'Driftsforstyrrelser 3',
  )
  await expect(sheet.getByText('Fra Rejseplanen, på dansk')).toHaveCount(0)
})

test('Show on map on a card raises the chip, and Clear takes it down', async ({ page }) => {
  await page.goto('/en?tab=disruptions')
  const card = page
    .getByRole('list', { name: 'Active now' })
    .getByRole('listitem')
    .filter({ hasText: 'Færre S-tog mellem København H og Hellerup' })
  await card.getByRole('button', { name: 'Show on map' }).click()
  const chip = page.getByRole('button', {
    name: 'Showing: Færre S-tog mellem København H og Hellerup · Clear',
  })
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(chip).toBeHidden()
})

/** Where the middle of the room a fit leaves on a desktop is, clear of what floats over the map. */
async function roomMiddle(page: Page) {
  const { width, height } = page.viewportSize()!
  const notice = (await page
    .getByRole('status')
    .filter({ hasText: 'Recorded data' })
    .boundingBox())!
  const legend = (await page
    .getByRole('list', { name: 'Data states' })
    .locator('..')
    .boundingBox())!
  const top = Math.max(146, notice.y + notice.height + 42 + 24)
  const bottom = Math.max(48, height - legend.y + 24)
  return { x: 412 + (width - 412 - 400) / 2, y: top + (height - top - bottom) / 2 }
}

for (const [map, angle, view] of [
  ['', '', 'a flat map'],
  ['&map=13.00/55.67000/12.57000/-30.0/50.0', '\\/-30\\.0\\/50\\.0', 'a tilted, turned map'],
] as const) {
  test(`a tap on a ringed stop opens its departures, on ${view}`, async ({ page }) => {
    await page.goto(`/en?tab=disruptions${map}`)
    // The 5C diversion names two platforms of one stop, Klaksvigsgade: one ring and no stretch,
    // so the camera centres it in the room the sheet, the panel, the recording's notice with the
    // chip under it, and the legend leave (fitPadding on a desktop), at the map's tilt and heading.
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Linje 5C kører en anden rute ved Langebro' })
      .getByRole('button', { name: 'Show on map' })
      .click()
    await expect(page.getByRole('button', { name: /^Showing: Linje 5C/ })).toBeVisible()
    // The camera has settled on the ring, at the fit's closest zoom, once the address says so.
    await expect(page).toHaveURL(new RegExp(`[?&]map=15\\.00\\/[\\d.]+\\/[\\d.]+${angle}(&|$)`))
    const centre = await roomMiddle(page)
    const panel = page.getByRole('dialog', { name: 'Klaksvigsgade' })
    await expect(async () => {
      await page.mouse.click(centre.x, centre.y)
      await expect(panel).toBeVisible({ timeout: 1_000 })
    }).toPass()
  })
}

test('Show on map on a tilted, turned map fits the stretch and keeps the tilt and heading', async ({
  page,
}) => {
  await page.goto('/en?tab=disruptions&map=15.00/55.67000/12.57000/-30.0/50.0')
  await page
    .getByRole('list', { name: 'Active now' })
    .getByRole('listitem')
    .filter({ hasText: 'Færre S-tog mellem København H og Hellerup' })
    .getByRole('button', { name: 'Show on map' })
    .click()
  await expect(page.getByRole('button', { name: /^Showing: Færre S-tog/ })).toBeVisible()
  // Out from the close link to the stretch from København H to Hellerup, at the same angle.
  await expect(page).toHaveURL(/[?&]map=1[0-4]\.\d\d\/[\d.]+\/[\d.]+\/-30\.0\/50\.0(&|$)/)
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-tilt', '50')
  await expect(map).toHaveAttribute('data-heading', '-30')
})
