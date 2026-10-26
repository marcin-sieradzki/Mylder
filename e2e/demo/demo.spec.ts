import { expect, test } from '@playwright/test'

// The GitHub Pages demo (ADR 0013): the static pages under /mylder, whose routes the simulated
// tracker answers in the page's Web Worker, and the planes the recording bundled with it.

test.describe('a first visit to /mylder/ from a browser asking for Danish', () => {
  test.use({ locale: 'da-DK' })

  test('lands on /mylder/da', async ({ page }) => {
    await page.goto('/mylder/')
    await expect(page).toHaveURL('/mylder/da')
    await expect(page.locator('html')).toHaveAttribute('lang', 'da')
    await expect(page.getByRole('status').filter({ hasText: /^Simulerede data/ })).toContainText(
      'Fly: optagne data fra adsb.lol.',
    )
  })
})

test('the map fills with simulated vehicles, and says they are made up', async ({ page }) => {
  await page.goto('/mylder/en')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Simulated data: vehicles and times are made up from the timetable.' }),
  ).toBeVisible()
  await expect
    .poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles')))
    .toBeGreaterThan(0)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
})

test('the map draws the recorded planes, counts them on the Planes filter, and says they are recorded adsb.lol data', async ({
  page,
}) => {
  await page.goto('/mylder/en')
  const map = page.locator('[data-aircraft]')
  const drawn = async () => Number(await map.getAttribute('data-aircraft'))
  await expect.poll(drawn).toBeGreaterThan(0)
  const planes = page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: /^Planes/ })
  await expect(planes).toHaveAttribute('aria-pressed', 'true')
  // The chip counts every plane in the snapshot, and the map draws them all.
  const counted = async () => Number((await planes.textContent())?.match(/^Planes (\d+)$/)?.[1])
  await expect.poll(async () => (await counted()) === (await drawn())).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: /^Simulated data/ })).toHaveText(
    'Simulated data: vehicles and times are made up from the timetable. Planes: recorded adsb.lol data.',
  )
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toContainText('Aircraft: © adsb.lol contributors under the ODbL.')
  await expect(about).toContainText(
    "The planes are recorded adsb.lol data, open under the same licence in Mylder's repository.",
  )
})

test("a row of the Vehicles list opens that vehicle's stops", async ({ page }) => {
  await page.goto('/mylder/en?tab=vehicles')
  const table = page
    .getByRole('dialog', { name: 'Overview' })
    .getByRole('table', { name: 'Vehicles' })
  await table.getByRole('link').first().click()
  await expect(page).toHaveURL(/^[^?]*\/mylder\/en\?.*trip=/)
  await expect(page.getByRole('list', { name: 'Stops' })).toBeVisible()
})

test('the language switch stays in the demo', async ({ page }) => {
  await page.goto('/mylder/en?tab=vehicles')
  await page
    .getByRole('navigation', { name: 'Language' })
    .getByRole('link', { name: 'Dansk' })
    .click()
  await expect(page).toHaveURL('/mylder/da?tab=vehicles')
  await expect(page.getByRole('dialog', { name: 'Overblik' })).toBeVisible()
})
