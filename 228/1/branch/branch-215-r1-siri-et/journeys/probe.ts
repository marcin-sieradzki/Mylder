import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  console.log('updates', JSON.stringify(s.updates), 'fetched', new Date(s.fetched).toISOString(), 'trips', s.trips.length)
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet.getByRole('group', { name: 'On the move' })).toContainText(/\d/)
  console.log('pulse', JSON.stringify((await sheet.getByRole('tabpanel').innerText()).replace(/\n\d\d:\d\d \d+/g, '').slice(0, 3000)))
  console.log('credit', JSON.stringify(await page.getByRole('link', { name: 'Rejseplanen' }).locator('xpath=..').innerText()))
  await step('probe')
  await page.getByRole('button', { name: 'About Mylder' }).click()
  console.log('about', JSON.stringify(await page.getByRole('dialog', { name: 'About Mylder' }).innerText()))
}
