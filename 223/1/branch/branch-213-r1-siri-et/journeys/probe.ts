import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const KEY = process.env.PROBE_KEY!
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const t = snap.trips.find((t: any) => t.key === KEY)
  console.log(JSON.stringify({ fetched: snap.fetched, pos: t.position, state: t.state, delay: t.delay, next: t.next[0] }))
  await page.goto(`/en?map=16.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('button', { name: 'Pause' }).click()
  const t0 = Date.now()
  await step('probe paused')
  const tip = page.getByRole('tooltip')
  const found: any[] = []
  for (let y = 180; y < 700; y += 8) for (let x = 400; x < 1220; x += 8) {
    if (y > 500 && x < 650) continue
    await page.mouse.move(x, y)
    if (await tip.isVisible({ timeout: 0 } as any)) { const s = (await tip.innerText()).replace(/\s+/g, ' '); if (/5C|Bus/.test(s)) found.push([x, y, s]) }
  }
  const uniq: Record<string, any> = {}
  for (const f of found) (uniq[f[2]] ??= []).push([f[0], f[1]])
  for (const k in uniq) { const pts = uniq[k]; const cx = pts.reduce((a: number, p: any) => a + p[0], 0) / pts.length, cy = pts.reduce((a: number, p: any) => a + p[1], 0) / pts.length; console.log(k, Math.round(cx), Math.round(cy), pts.length) }
  console.log('scan s', (Date.now() - t0) / 1000)
}
