import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
const notice = {
  en: /^The timetable ends on 26 August\. Without a new one, the map has no trips after that\.$/,
  da: /^Køreplanen slutter 26\. august\. Uden en ny har kortet ingen ture derefter\.$/,
}
export default async ({ page, step, expect }: Journey) => {
  for (const lang of ['en', 'da'] as const) {
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
    await expect(page.getByRole('status').filter({ hasText: notice[lang] })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('status').filter({ hasText: /adsb\.lol/ })).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(3000)
    const vw = page.viewportSize()!.width
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    const boxes = []
    for (const s of await page.getByRole('status').all()) {
      if (!(await s.isVisible())) continue
      const text = (await s.innerText()).replace(/\n/g, ' ').trim()
      if (text) boxes.push({ text, box: await s.boundingBox() })
    }
    dump(`phone-${lang}`, { vw, sw, boxes })
    await step(`phone ${lang} notice and banner`)
    expect(sw).toBeLessThanOrEqual(vw)
    expect(boxes.map((b) => b.text)).toHaveLength(2)
    expect(boxes[0].text).toMatch(notice[lang])
    expect(boxes[1].text).toMatch(L[lang].banner)
    for (const b of boxes) { expect(b.box!.x).toBeGreaterThanOrEqual(0); expect(b.box!.x + b.box!.width).toBeLessThanOrEqual(vw) }
  }
}
