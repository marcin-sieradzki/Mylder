import { expect, test } from './recording'

test('the English shell loads at /en', async ({ page }) => {
  await page.goto('/en')
  await expect(page).toHaveTitle('Mylder: live map of Copenhagen')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('link', { name: 'Mylder' })).toBeVisible()
})

test('the Danish shell loads at /da', async ({ page }) => {
  await page.goto('/da')
  await expect(page).toHaveTitle('Mylder: livekort over København')
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
})

test('any other first segment is not found', async ({ page }) => {
  const response = await page.goto('/sv')
  expect(response?.status()).toBe(404)
})
