import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-arrivals, desktop: Nørreport St.'s first arrival row in detail (07:21-07:28) and the note under the list.
export default async ({ page, step, expect }: Journey) => {
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  expect(fetched).toBeGreaterThanOrEqual(Date.UTC(2026, 5, 16, 5, 21))
  expect(fetched).toBeLessThan(Date.UTC(2026, 5, 16, 5, 28))
  await page.goto('/en?stop=27532&board=arrivals')
  const tp = page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('tabpanel', { name: 'Arrivals' })
  const first = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').first()
  await expect(first).toContainText('From Holte St.')
  console.log('FIRST ROW:\n' + (await first.innerText()))
  for (const t of ['E', 'Live', '07:27']) await expect(first).toContainText(t)
  await expect(first).toContainText(/\+[12]/)
  await expect(first).toContainText(/07:2[89]/)
  await expect(first).toContainText(/Now|\d+\s*min/)
  expect(await first.locator('time', { hasText: '07:27' }).first().evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through')
  await expect(tp.getByRole('list', { name: 'Arrivals' })).toContainText('From Sundbyvester Plads')
  await expect(tp.getByRole('list', { name: 'Arrivals' })).toContainText('From Herlev Hospital, Sløjfen')
  await expect(tp).toContainText('From the timetable')
  await expect(tp).toContainText(/Timetable and positions \d\d:\d\d/)
  await step('Nørreport arrivals in detail')
}
