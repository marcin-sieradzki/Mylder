import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { region, sleep } from './lib.ts'
// Pass rule 3 (aircraft), second look: a plane over the built-up city (SAS506 over the north-west), zoom 14, tilted.
export default async ({ page, step, expect }: Journey) => {
  const find = async () => ((await (await page.request.get('/api/aircraft')).json()).aircraft as any[]).find((p) => p.hex === '4caf7e')
  const plane = await find()
  if (!plane) throw new Error('the recording has no SAS506 (4caf7e) now: no plane over the built-up city to look at')
  await page.goto(`/en?map=14.00/${plane.lat}/${plane.lon}`)
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft')), { timeout: 30000 }).toBeGreaterThan(0)
  await step(`flat on SAS506 at ${plane.lat},${plane.lon}`)
  await region(page).focus()
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+ArrowUp'); await sleep(400) }
  for (let i = 0; i < 3; i++) { await sleep(2500); await step(`tilted, ${i}`) }
}
