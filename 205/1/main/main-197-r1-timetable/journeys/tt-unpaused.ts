// Pass rule 6: City pulse is never paused on the timetable source, across snapshots.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  const updated = page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)
  await step('City pulse at first snapshot')
  const seen = new Set<string>()
  const t0 = Date.now()
  while (Date.now() - t0 < 150_000) {
    seen.add(await updated.innerText())
    const text = await sheet.getByRole('tabpanel', { name: 'City pulse' }).innerText()
    expect(text).not.toMatch(/paus/i)
    await expect(sheet.getByRole('group', { name: 'Reporting live' })).toContainText('No live positions yet; placed from the timetable')
    await expect(page.getByText(/paused/i)).toHaveCount(0)
    await page.waitForTimeout(10_000)
  }
  console.log(`updates seen: ${[...seen].join(', ')}`)
  expect(seen.size).toBeGreaterThanOrEqual(2)
  await step('City pulse after two and a half minutes, still not paused')
}
