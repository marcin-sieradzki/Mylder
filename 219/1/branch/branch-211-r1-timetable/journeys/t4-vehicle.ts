import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './dump.ts'
const J = 't4-vehicle'
// Hovers outward from the middle until a dot's card shows, then taps there.
const tap = async (page: any, expect: any, dialog: any) => {
  const vp = page.viewportSize()!
  const pts: number[][] = []
  for (let r = 0; r <= 200; r += 7) for (let a = 0; a < 360; a += r ? 20 : 360) pts.push([vp.width / 2 + r * Math.cos(a * Math.PI / 180), vp.height / 2 + r * Math.sin(a * Math.PI / 180)])
  await expect(async () => {
    for (const [x, y] of pts) {
      await page.mouse.move(x, y)
      if (await page.getByRole('tooltip').isVisible()) { await page.mouse.click(x, y); break }
    }
    await expect(dialog).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 60000 })
}
const MODES = ['bus', 'metro', 's-tog', 'train', 'light-rail', 'aircraft']
export default async ({ page, step, expect }: Journey) => {
  for (const mode of ['bus', 'metro', 's-tog']) {
    const snap = await (await page.request.get('/api/snapshot')).json()
    const t = snap.trips.find((x: any) => x.mode === mode && !x.waiting)
    if (!t) { dump(J, `${mode}`, 'none underway'); continue }
    await page.goto(`/en?hide=${MODES.filter((m) => m !== mode).join(',')}&map=14.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
    await page.getByRole('button', { name: 'Pause' }).click()
    await step(`${mode} centred`)
    const any = page.getByRole('dialog', { name: / to / })
    await tap(page, expect, any)
    await expect(page).toHaveURL(/trip=/)
    const panel = any
    await expect(panel).toContainText('Timetable only')
    await expect(panel).toContainText(/Timetable\s·\splaced \d\d:\d\d:\d\d/)
    await expect(panel).not.toContainText(/Rejseplanen|times from the timetable|From the timetable/)
    if (mode === 'metro') await expect(panel).toContainText('Runs to an interval')
    else {
      await expect(panel).toContainText('No live positions yet; placed from the timetable.')
      const stops = await panel.getByRole('list', { name: 'Stops' }).getByRole('listitem').allInnerTexts()
      expect(stops.some((s: string) => /~|[+−-]\d/.test(s.replace(/St\.|\(.*?\)/g, '')))).toBe(false)
    }
    await page.waitForTimeout(800)
    await step(`${mode} vehicle open`)
    dump(J, `en.${mode}`, `${new URL(page.url()).searchParams.get('trip')}\n${await panel.innerText()}`)
    if (mode === 'bus') {
      const key = new URL(page.url()).searchParams.get('trip')!
      await page.goto(`/da?trip=${encodeURIComponent(key)}`)
      const dp = page.getByRole('dialog', { name: / (mod|til) / })
      await expect(dp).toContainText(/Køreplan\s·\splaceret/)
      await expect(dp).toContainText('Ingen livepositioner endnu; placeret efter køreplanen.')
      await page.waitForTimeout(800)
      await step('da bus vehicle')
      dump(J, 'da.bus', await dp.innerText())
    }
  }
}
