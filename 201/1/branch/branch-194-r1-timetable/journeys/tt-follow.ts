import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?tab=vehicles')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  // an S-tog underway moves far enough in seconds to see
  const snap = await (await page.request.get('/api/snapshot')).json()
  const t = snap.trips.find((x: any) => x.mode === 's-tog' && !x.waiting)
  await page.getByRole('table', { name: 'Vehicles' }).locator(`a[href*="${t.key}"]`).first().click()
  const panel = page.getByRole('dialog', { name: / to / }).last()
  await expect(panel).toContainText('Timetable only')
  await step('S-tog panel open')
  await panel.getByRole('button', { name: 'Follow' }).click()
  await page.waitForTimeout(3000)
  const vp = page.viewportSize()!
  const hover = async () => {
    for (let r = 0; r <= 40; r += 4) for (let ang = 0; ang < 360; ang += r === 0 ? 360 : 30) {
      await page.mouse.move(vp.width / 2 + r * Math.cos(ang * Math.PI / 180), vp.height / 2 + r * Math.sin(ang * Math.PI / 180))
      if (await page.getByRole('tooltip').isVisible().catch(() => false)) return page.getByRole('tooltip').innerText()
    }
    return null
  }
  const first = await hover()
  console.log(`card at centre on follow: ${first}`)
  expect(first).toContain(t.line)
  await step('following: the dot at the centre')
  await page.mouse.move(5, vp.height - 5)
  await page.waitForTimeout(12000)
  await step('following, 12 s later')
  const card = await hover()
  console.log(`card at centre: ${card}`)
  expect(card).toContain(t.line)
  expect(card).toContain('Timetable only')
}
