import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Feature stop-arrivals, recipe "Arrivals by link and keys" (Refshaleøen).
export default async ({ page, step, expect }: Journey) => {
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  await page.goto('/en?stop=48645&board=arrivals')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const dep = panel.getByRole('tab', { name: 'Departures' }), arrTab = panel.getByRole('tab', { name: 'Arrivals' })
  await expect(arrTab).toHaveAttribute('aria-selected', 'true')
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const row = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').filter({ hasText: 'From Orientkaj St.' }).first()
  await expect(row).toContainText('991')
  await expect(row.getByRole('button', { name: 'Bus 991 from Orientkaj St.' })).toBeAttached()
  console.log('ROW:', await row.innerText())
  if (fetched < Date.parse('2026-06-16T05:26:00Z')) {
    await expect(row).toContainText('Timetable only'); await expect(row).toContainText('07:47'); await expect(row).toContainText('—')
  } else if (fetched >= Date.parse('2026-06-16T05:27:00Z')) {
    await expect(row).toContainText('Live'); await expect(row).toContainText('07:49'); await expect(row).toContainText('+2')
  }
  await step('Refshaleøen opened on Arrivals by link')
  await arrTab.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(dep).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dep).toHaveAttribute('aria-selected', 'true')
  expect(page.url()).not.toMatch(/board=/)
  await step('ArrowLeft + Enter back to Departures')
}
