import { expect, test } from '@playwright/test'

test('app loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Mylder')
  await expect(page.getByRole('link', { name: 'Mylder' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
