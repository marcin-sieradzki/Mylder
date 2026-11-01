import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// map-delays, "A cancelled trip absent": the two cancelled 102A trips, 09:22 to 09:25.
const KEYS = ['bus.102A.5c72f1b7d1.20261031.0922', 'bus.102A.4a8f8e09fc.20261031.0904']

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map loaded')
  let snap: any
  await expect(async () => {
    snap = await (await page.request.get('/api/snapshot')).json()
    const drawn = snap.trips.filter((t: any) => !t.cancelled).length
    await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(drawn), { timeout: 2000 })
  }).toPass({ timeout: 30000 })
  console.log('fetched', new Date(snap.fetched).toISOString(), 'trips', snap.trips.length,
    'cancelled', snap.trips.filter((t: any) => t.cancelled).map((t: any) => t.key).join(','),
    'data-vehicles', await page.locator('[data-vehicles]').getAttribute('data-vehicles'))
  for (const key of KEYS) {
    const t = snap.trips.find((x: any) => x.key === key)
    expect(t, `${key} in /api/snapshot at ${new Date(snap.fetched).toISOString()}`).toBeTruthy()
    expect(t.cancelled, key).toBe(true)
    console.log(key, t.state, t.position)
    await page.goto(`/en?map=16.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(800)
    const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    const seen: string[] = []
    for (let r = 0; r <= 24; r += 3)
      for (let a = 0; a < 360; a += r === 0 ? 360 : 30) {
        await page.mouse.move(cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180))
        try {
          await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 60 })
          seen.push((await page.getByRole('tooltip').textContent()) ?? '')
        } catch {}
      }
    console.log('tooltips near', key, JSON.stringify([...new Set(seen)]))
    expect(seen.filter((s) => s.startsWith('Bus 102A')), `no 102A card at ${key}'s position`).toEqual([])
    await page.mouse.move(cx, cy)
    await step(`no dot at ${key.split('.').at(-1)}`)
    await page.mouse.click(cx, cy)
    await page.waitForTimeout(600)
    expect(new URL(page.url()).searchParams.get('trip')).not.toBe(key)
    await step(`tap there does not open ${key.split('.').at(-1)}`)
  }
}
