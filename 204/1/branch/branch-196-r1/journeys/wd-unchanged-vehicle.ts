import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Unchanged source: a vehicle's source line on the weekday recording, a bus and a Metro trip.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  for (const mode of ['bus', 'metro']) {
    const t = snap.trips.find((x: any) => x.mode === mode && !x.waiting)
    await page.goto('/en?tab=vehicles')
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
    await page.getByRole('table', { name: 'Vehicles' }).locator(`a[href*="${t.key}"]`).first().click()
    const panel = page.getByRole('dialog', { name: / to / }).last()
    await expect(panel.getByRole('list', { name: 'Stops' })).toBeVisible({ timeout: 20000 })
    await expect(page).toHaveURL(/[?&]trip=/)
    const text = await panel.innerText()
    const lines = text.split('\n').filter((l) => /·/.test(l))
    console.log(`${mode} ${t.key} state ${t.state}: source line(s): ${JSON.stringify(lines)}`)
    console.log(`${mode} facts: ${text.split('\n').slice(0, 22).join(' / ')}`)
    const src = lines[lines.length - 1]
    if (mode === 'bus') {
      expect(src).toMatch(/^Rejseplanen/)
      expect(src).toMatch(/times from the timetable|times \d\d:\d\d/)
    } else expect(src).toMatch(/^Timetable\s·\supdated \d\d:\d\d:\d\d$/)
    expect(text).not.toMatch(/placed \d\d:\d\d|No live positions yet/)
    await step(`${mode} panel on the recording`)
  }
}
