import { expect, test } from '@playwright/test'

/** The page background's lightness, 0 (black) to 255 (white), from its computed colour. */
async function backgroundLightness(page: import('@playwright/test').Page) {
  const colour = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const [r, g, b] = colour.match(/\d+(\.\d+)?/g)!.map(Number)
  return (r + g + b) / 3
}

test.describe('theme', () => {
  test('follows a light system setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    expect(await backgroundLightness(page)).toBeGreaterThan(200)
  })

  test('follows a dark system setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
    expect(await backgroundLightness(page)).toBeLessThan(60)
  })
})
