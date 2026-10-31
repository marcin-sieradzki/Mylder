import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: a shared link ?stop=<id>&board=arrivals opens the stop on Arrivals; an unknown delay reads "—".
export default async ({ page, step, expect }: Journey) => {
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  await page.goto('/en?stop=48645&board=arrivals')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel.getByRole('tab', { name: 'Arrivals' })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('tab', { name: 'Departures' })).toHaveAttribute('aria-selected', 'false')
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const row = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').filter({ hasText: 'From Orientkaj St.' }).first()
  await expect(row).toContainText('991')
  await expect(row.getByRole('button', { name: 'Bus 991 from Orientkaj St.' })).toBeVisible()
  const t = await row.innerText()
  console.log('ROW:', t)
  if (fetched < Date.parse('2026-06-16T05:26:00Z')) {
    await expect(row).toContainText('Timetable only')
    await expect(row).toContainText('—')
    await expect(row).toContainText('07:47')
  } else {
    await expect(row).toContainText(/Live|Estimated|Ageing/)
  }
  await step('Refshaleøen opened on Arrivals from link')
}
