import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, aircraft, viewportMiddle, around } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft'))).toBeGreaterThan(0)
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Planes/ })
  await expect(chip).toHaveText(/\d/)
  await expect(page.getByRole('link', { name: '© adsb.lol contributors' })).toBeVisible()
  await step('planes drawn, chip count, credit')
  await chip.click()
  await expect(page.locator('[data-aircraft]')).toHaveAttribute('data-aircraft', '0')
  await step('planes off')
  await chip.click()
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft'))).toBeGreaterThan(0)
  const a = await aircraft(page)
  const p = a.aircraft.filter((x: any) => x.callsign).sort((x: any, y: any) => x.speed - y.speed)[0]
  await page.goto(`/en?map=13.00/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`)
  await ready(page, expect)
  const { x, y } = viewportMiddle(page)
  const dlg = page.getByRole('dialog', { name: p.callsign })
  let ok = false
  for (const q of around(x, y, 40, 8)) {
    await page.mouse.click(q.x, q.y)
    await page.waitForTimeout(250)
    if (await dlg.isVisible()) { ok = true; break }
  }
  if (!ok) throw new Error(`no panel for ${p.callsign} from a tap near the middle`)
  await expect(page).toHaveURL(new RegExp(`aircraft=${p.hex}`))
  await step('plane panel')
}
