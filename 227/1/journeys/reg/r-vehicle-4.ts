import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await step('list')
  await table.getByRole('row').nth(1).getByRole('link').first().click()
  const panel = page.getByRole('dialog', { name: / to / })
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(/trip=/)
  for (const w of ['Delay', 'Last seen', 'Next stop']) await expect(panel.getByText(w, { exact: true }).first()).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Stops' })).toBeVisible()
  await expect(panel).toContainText(/times from the timetable|Timetable\s·\supdated|position\s\d/)
  await step('vehicle open from list')
  await panel.getByRole('button', { name: 'Follow' }).click()
  await step('follow')
  await panel.getByRole('button', { name: 'Show whole line' }).click()
  const chip = page.getByRole('button', { name: /^Showing: line .* · Clear$/ })
  await expect(chip).toBeVisible()
  await step('whole line')
  await chip.click()
  await expect(chip).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/trip=/)
  await step('closed')
  // from a dot
  const snap = await (await page.request.get('/api/snapshot')).json()
  const t = snap.trips.find((x: any) => x.mode === 'bus' && !x.waiting)
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  const vp = page.viewportSize()!
  const dlg = page.getByRole('dialog', { name: new RegExp(`to ${t.headsign}`) })
  await expect(async () => {
    const pts: number[][] = []
    for (let r = 0; r <= 200; r += 7) for (let a = 0; a < 360; a += r ? 20 : 360) pts.push([r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)])
    let hit = false
    for (const [dx, dy] of pts) {
      await page.mouse.move(vp.width / 2 + dx, vp.height / 2 + dy)
      if (await page.getByRole('tooltip').isVisible()) { await page.mouse.click(vp.width / 2 + dx, vp.height / 2 + dy); hit = true; break }
    }
    expect(hit).toBe(true)
    await expect(page.getByRole('dialog', { name: / to / })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 60000 })
  await step('vehicle open from dot')
  await page.goto('/en?trip=nothing')
  await expect(page.getByRole('dialog', { name: 'Trip not found' })).toBeVisible()
  await step('missing')
}
