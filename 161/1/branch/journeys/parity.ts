import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { findDots } from './find-dots.ts'

// Pass rules: flat and north-up, every dot sits where it does today and keeps one size at every zoom.
// Opens the same view on main and the branch at the same moment, pauses, and records where each filled dot is drawn.
export default async ({ page, step, expect }: Journey) => {
  for (const view of (process.env.VIEWS ?? '12.50/55.6800/12.5500,14.00/55.6720/12.5650').split(',')) {
    await page.goto(`/en?map=${view}`)
    await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
    await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: /close/i }).click()
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(2500)
    await step(`paused at ${view}`)
    const dots = await findDots(page, 0)
    console.log('view', view, 'dots', JSON.stringify(dots.map((d) => ({ x: Math.round(d.x), y: Math.round(d.y), core: d.core, rgb: d.rgb.join(',') }))))
  }
}
