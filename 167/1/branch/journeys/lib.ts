import type { Page } from '@playwright/test'
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const region = (page: Page) => page.getByRole('region', { name: 'Live map of Copenhagen' })
export const tiltTo = async (page: Page, presses: number, key = 'Shift+ArrowUp') => {
  await region(page).focus()
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key)
    await sleep(600)
  }
  await sleep(1500)
}
export const zoomOf = (page: Page) => Number(new URL(page.url()).searchParams.get('map')?.split('/')[0])
export const ready = async (page: Page, expect: any) => {
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles')), { timeout: 30000 }).toBeGreaterThan(0)
}
