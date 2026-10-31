import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: open København Syd St. while the RE to Næstved stands there (07:22-07:23 on the recording) ->
// a standing row with RE, Næstved St., Track 8, its data state and a time about 07:23; tapping it opens the train.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map loaded')
  await expect.poll(async () => Number((await (await page.request.get('/api/snapshot')).json()).fetched), { timeout: 200000, intervals: [1000] })
    .toBeGreaterThanOrEqual(Date.parse('2026-06-16T05:22:00Z'))
  const fetched = (await (await page.request.get('/api/snapshot')).json()).fetched
  console.log('snapshot fetched', new Date(fetched).toISOString())
  if (Number(fetched) >= Date.parse('2026-06-16T05:23:00Z')) throw new Error('Precondition missed: snapshot already at ' + new Date(fetched).toISOString() + ', past the RE\'s standing minute')
  await page.goto('/en?stop=8600783')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(panel.getByRole('region', { name: 'Departures' })).toBeVisible()
  await step('København Syd St. opened')
  await expect(panel).toContainText('Rejseplanen')
  await expect(panel).toContainText(/departures \S*\d\d:\d\d/)
  const standing = panel.getByRole('region', { name: 'At the platforms now' })
  const row = standing.getByRole('listitem').filter({ hasText: 'Næstved St.' }).first()
  await expect(row).toContainText('RE')
  await expect(row).toContainText('Track 8')
  await expect(row).toContainText(/Live|Ageing|Estimated|Timetable only|Scheduled|No signal/)
  await expect(row.getByRole('time')).toHaveText(/^~?07:2[2-4]$/)
  console.log('ROW:', await row.innerText())
  console.log('API standing:', JSON.stringify((await (await page.request.get('/api/stops/8600783')).json()).standing))
  await step('RE to Næstved St. on track 8')
  await row.getByRole('button').first().click()
  await expect(page.getByRole('dialog', { name: /RE.*Næstved|Næstved/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  expect(page.url()).not.toMatch(/[?&]stop=/)
  await step('train panel opened from standing row')
}
