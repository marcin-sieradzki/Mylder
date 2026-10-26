import { expect, test } from '@playwright/test'

test('the corner credit opens the About dialog on a phone, and Esc closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en')
  await page.getByRole('link', { name: 'Rejseplanen' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toBeVisible()
  await expect(about).toContainText('under CC BY 4.0. Timetable of')
  await expect(about.getByRole('list').last()).toContainText('Esc')
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()
})

test('the top bar’s About button opens it in Danish', async ({ page }) => {
  await page.goto('/da')
  await page.getByRole('button', { name: 'Om Mylder' }).click()
  await expect(page.getByRole('dialog', { name: 'Om Mylder' })).toContainText('Datatilstande')
})
