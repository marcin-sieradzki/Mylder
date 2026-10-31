import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const t0 = Date.now()
  const log: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) log.push(((Date.now() - t0) / 1000).toFixed(1) + ' ' + r.url()) })
  const snap = async () => { const s = await (await page.request.get('/api/snapshot')).json(); return new Date(s.fetched).toISOString().slice(11, 19) + ' calls=' + s.budget.calls }
  console.log('start', await snap())
  await page.goto('/en?stop=8600783')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  console.log('DEP:\n' + (await panel.getByRole('tabpanel', { name: 'Departures' }).innerText()))
  for (let i = 0; i < 7; i++) { await page.waitForTimeout(10000); console.log(((Date.now() - t0) / 1000).toFixed(0), await snap()) }
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp.getByRole('list', { name: 'Arrivals' })).toBeVisible()
  console.log('ARR:\n' + (await tp.innerText()))
  console.log('ROW HTML:\n' + (await tp.getByRole('listitem').first().innerHTML()))
  await step('arr')
  for (let i = 0; i < 7; i++) { await page.waitForTimeout(10000); console.log(((Date.now() - t0) / 1000).toFixed(0), await snap()) }
  console.log(log.filter((l) => !l.includes('/api/snapshot')).join('\n'))
}
