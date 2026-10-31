import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: the arrivals answer is asked for only while the Arrivals tab is open.
export default async ({ page, step, expect }: Journey) => {
  const urls: { t: number; u: string }[] = []
  const t0 = Date.now()
  page.on('request', (r) => urls.push({ t: Date.now() - t0, u: r.url() }))
  const arrivals = () => urls.filter((x) => new URL(x.u).pathname.endsWith('/arrivals'))
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await page.waitForTimeout(65000)
  console.log('stop requests on Departures after 65 s:', urls.filter((x) => x.u.includes('/api/stops')).map((x) => x.t + ' ' + x.u))
  expect(arrivals()).toHaveLength(0)
  await step('Departures held 65 s, no arrivals asked')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(panel.getByRole('list', { name: 'Arrivals' })).toBeVisible()
  await expect.poll(() => arrivals().length).toBeGreaterThanOrEqual(1)
  console.log('arrivals asked after opening:', arrivals().map((x) => x.t + ' ' + x.u))
  expect(arrivals().every((x) => new URL(x.u).pathname === '/api/stops/27532/arrivals')).toBe(true)
  await step('Arrivals opened, one arrivals request')
  await page.waitForTimeout(65000)
  const n = arrivals().length
  console.log('arrivals after 65 s on Arrivals:', arrivals().map((x) => x.t + ' ' + x.u))
  await panel.getByRole('tab', { name: 'Departures' }).click()
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await page.waitForTimeout(65000)
  console.log('all stop requests:', urls.filter((x) => x.u.includes('/api/stops')).map((x) => x.t + ' ' + x.u))
  expect(arrivals().length).toBe(n)
  await step('Departures again 65 s, no further arrivals asked')
}
