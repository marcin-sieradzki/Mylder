import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
const hms = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms)
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const line = page.getByRole('banner').getByText(/^Updated /)
  await expect(line).toBeVisible()
  const text = await line.innerText()
  const snap = await (await page.request.get('/api/snapshot')).json()
  await step('updated line')
  dump('updated', { text, fetched: snap.fetched, fetchedLocal: hms(snap.fetched), now: hms(Date.now()) })
  expect(text).toMatch(/^Updated \d\d:\d\d:\d\d$/)
  await expect.poll(async () => {
    const s = await (await page.request.get('/api/snapshot')).json()
    return `Updated ${hms(s.fetched)}` === (await line.innerText()) || `Updated ${hms(snap.fetched)}` === (await line.innerText())
  }, { timeout: 70000 }).toBe(true)
  await step('matches snapshot fetched')
}
