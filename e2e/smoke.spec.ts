import { expect, test } from '@playwright/test'

test('the English shell loads at /en', async ({ page }) => {
  await page.goto('/en')
  await expect(page).toHaveTitle('Mylder: live map of Copenhagen')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('link', { name: 'Mylder' })).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Watch Copenhagen move.' }),
  ).toBeVisible()
})

test('the Danish shell loads at /da', async ({ page }) => {
  await page.goto('/da')
  await expect(page).toHaveTitle('Mylder: live kort over København')
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
})

test('any other first segment is not found', async ({ page }) => {
  const response = await page.goto('/sv')
  expect(response?.status()).toBe(404)
})
