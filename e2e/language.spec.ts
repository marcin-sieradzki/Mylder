import { expect, test } from '@playwright/test'

test.describe('a first visit to /', () => {
  test.describe('from a browser asking for Danish', () => {
    test.use({ locale: 'da-DK' })

    test('lands on /da', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL('/da')
      await expect(page.locator('html')).toHaveAttribute('lang', 'da')
    })
  })

  test.describe('from a browser asking for neither language', () => {
    test.use({ locale: 'de-DE' })

    test('lands on /en', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL('/en')
    })
  })
})

test('the language switch keeps the rest of the address', async ({ page }) => {
  await page.goto('/en?line=5C')
  await page
    .getByRole('navigation', { name: 'Language' })
    .getByRole('link', { name: 'Dansk' })
    .click()
  await expect(page).toHaveURL('/da?line=5C')
  await page
    .getByRole('navigation', { name: 'Sprog' })
    .getByRole('link', { name: 'English' })
    .click()
  await expect(page).toHaveURL('/en?line=5C')
})
