import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-arrivals, desktop: Nørreport St.
export default async ({ page, step, expect }: Journey) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  expect(urls.filter((u) => u.endsWith('/arrivals'))).toHaveLength(0)
  await step('departures')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(/\?stop=27532&board=arrivals/)
  const list = panel.getByRole('tabpanel', { name: 'Arrivals' }).getByRole('list', { name: 'Arrivals' })
  await expect(list).toBeVisible()
  await expect.poll(() => urls.filter((u) => u.includes('/api/stops/27532/arrivals')).length).toBe(1)
  const first = list.getByRole('listitem').first()
  await expect(first).toContainText('E')
  await expect(first).toContainText('From Holte St.')
  await expect(panel).toContainText('From the timetable')
  await expect(panel).toContainText(/Timetable and positions \d\d:\d\d/)
  await step('arrivals')
  await panel.getByRole('tab', { name: 'Departures' }).click()
  await expect(page).not.toHaveURL(/board=/)
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('back to departures')
}
