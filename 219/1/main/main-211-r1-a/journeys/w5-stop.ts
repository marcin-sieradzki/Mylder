import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './dump.ts'
const J = 'w5-stop'
// Nørreport St. (timetable answer), København Syd St. (recorded boards), a Metro stop; departures and arrivals.
const stops: [string, string][] = [['27532', 'Nørreport St.'], ['8600783', 'København Syd St.'], ['8603313', 'Bella Center St.']]
export default async ({ page, step, expect }: Journey) => {
  // From the map: Østerport St.
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  for (const [id, name] of stops) {
    await page.goto(`/en?stop=${id}`)
    const panel = page.getByRole('dialog', { name })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('tablist', { name: 'Departures and arrivals' })).toBeVisible()
    await expect(panel.getByRole('list', { name: 'Departures' }).or(panel.getByText(/No departures/))).toBeVisible()
    await page.waitForTimeout(1500)
    await step(`${id} departures`)
    dump(J, `en.${id}.departures`, await panel.innerText())
    await panel.getByRole('tab', { name: 'Arrivals' }).click()
    await expect(page).toHaveURL(/board=arrivals/)
    await expect(panel.getByRole('tabpanel', { name: 'Arrivals' })).toBeVisible()
    await page.waitForTimeout(1500)
    await step(`${id} arrivals`)
    dump(J, `en.${id}.arrivals`, await panel.innerText())
  }
  await page.goto('/da?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Afgange' })).toBeVisible()
  await page.waitForTimeout(1500)
  await step('da 27532 departures')
  dump(J, 'da.27532.departures', await panel.innerText())
}
