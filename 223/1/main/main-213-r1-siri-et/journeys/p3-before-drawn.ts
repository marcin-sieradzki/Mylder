import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { hoverFind } from './lib.ts'
// main's before for pass rule 3: bus 102A of 09:22 is drawn and hoverable after 09:22.
const KEY = 'bus.102A.5c72f1b7d1.20261031.0922'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  const snap = await (await page.request.get('/api/snapshot')).json()
  const t = snap.trips.find((t: any) => t.key === KEY)
  console.log(JSON.stringify({ fetched: new Date(snap.fetched).toISOString(), state: t?.state, cancelled: t?.cancelled }))
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on 102A of 09:22 paused')
  const text = await hoverFind(page, expect, /102A to Køge/, 200)
  console.log(JSON.stringify({ tooltip: text }))
  await step('102A of 09:22 hovered')
}
