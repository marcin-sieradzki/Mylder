import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { liveCount, map, opened } from './helpers.ts'

// map-filter: the Bus chip.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en')
  const s = await (await page.request.get('/api/snapshot')).json()
  const total = await liveCount(page)
  const buses = s.trips.filter((t: { mode: string; state: string }) => t.mode === 'bus' && t.state !== 'cancelled').length
  await expect(map(page)).toHaveAttribute('data-vehicles', String(total), { timeout: 20000 })
  await step('all drawn')
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  await chip.click()
  await expect(map(page)).toHaveAttribute('data-vehicles', String(total - buses), { timeout: 20000 })
  await expect(chip).toContainText(String(buses))
  await step('buses off, chip keeps its count')
  await chip.click()
  await expect(map(page)).toHaveAttribute('data-vehicles', String(total), { timeout: 20000 })
  await step('buses back')
}
