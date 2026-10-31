import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: open a Metro stop's Arrivals (Bella Center St. until 07:26, else Vestamager St. until 07:30) -> interval row "Every N min", the Metro note, no clock time.
export default async ({ page, step, expect }: Journey) => {
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  const [id, name] = fetched < Date.parse('2026-06-16T05:25:30Z') ? ['8603313', 'Bella Center St.'] : ['8603317', 'Vestamager St.']
  if (fetched >= Date.parse('2026-06-16T05:29:30Z')) throw new Error('Precondition missed: recording past 07:29:30, no Metro arrival left in the window')
  await page.goto('/en?stop=' + id)
  const panel = page.getByRole('dialog', { name })
  await expect(panel.getByRole('tablist', { name: 'Departures and arrivals' })).toBeVisible()
  await step(name + ' opened')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(new RegExp('stop=' + id + '&board=arrivals'))
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const row = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').filter({ hasText: 'M1' }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('From Vanløse St.')
  await expect(row).toContainText(/Every \d+ min/)
  const t = await row.innerText()
  console.log('ROW:', t)
  expect(t).not.toMatch(/\d\d:\d\d/)
  await expect(tp).toContainText('Metro: planned times')
  console.log('TABPANEL:\n' + (await tp.innerText()))
  await step('Metro interval row')
}
