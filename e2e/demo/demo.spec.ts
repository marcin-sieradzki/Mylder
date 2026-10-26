import { expect, test } from '@playwright/test'

// The GitHub Pages demo (ADR 0013): the static pages under /mylder, whose routes the simulated
// tracker answers in the page's Web Worker.

test.describe('a first visit to /mylder/ from a browser asking for Danish', () => {
  test.use({ locale: 'da-DK' })

  test('lands on /mylder/da', async ({ page }) => {
    await page.goto('/mylder/')
    await expect(page).toHaveURL('/mylder/da')
    await expect(page.locator('html')).toHaveAttribute('lang', 'da')
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
