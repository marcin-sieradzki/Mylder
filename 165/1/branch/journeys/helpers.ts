import type { Page } from '@playwright/test'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

export const map = (page: Page) => page.locator('[data-vehicles]')
export const scale = (page: Page) => page.getByText(/\d+\s(m|km)$/)
export const mapParam = (page: Page) => new URL(page.url()).searchParams.get('map')

export async function liveCount(page: Page) {
  const s = await (await page.request.get('/api/snapshot')).json()
  return s.trips.filter((t: { state: string }) => t.state !== 'cancelled').length
}

export async function expectAllDrawn({ page, expect }: Pick<Journey, 'page' | 'expect'>) {
  await expect(async () => {
    const n = await liveCount(page)
    await expect(map(page)).toHaveAttribute('data-vehicles', String(n), { timeout: 1000 })
  }).toPass({ timeout: 30000 })
}

export async function atRest({ page, expect }: Pick<Journey, 'page' | 'expect'>, tilt: string | RegExp, heading: string | RegExp) {
  await expect(map(page)).toHaveAttribute('data-tilt', tilt, { timeout: 20000 })
  await expect(map(page)).toHaveAttribute('data-heading', heading, { timeout: 20000 })
}

export async function press(page: Page, key: string, times: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(450)
  }
}

export async function opened({ page, expect }: Pick<Journey, 'page' | 'expect'>, url: string) {
  await page.goto(url)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
}
