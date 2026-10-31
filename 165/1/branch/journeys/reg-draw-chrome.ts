import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { expectAllDrawn, opened } from './helpers.ts'

// map-draw, map-chrome: open /en.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en')
  await expectAllDrawn({ page, expect })
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await expect(page).toHaveURL(/\/en$/)
  await step('map drawn with its chrome, address bare')
}
