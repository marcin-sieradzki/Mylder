import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
export default async ({ page, step, expect }: Journey) => {
  for (const lang of ['en', 'da'] as const) {
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
    await page.waitForTimeout(4000)
    const vw = page.viewportSize()!.width
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    const boxes = []
    for (const s of await page.getByRole('status').all()) {
      if (!(await s.isVisible())) continue
      boxes.push({ text: await s.innerText(), box: await s.boundingBox() })
    }
    dump(`phone-${lang}`, { vw, sw, boxes })
    await step(`phone ${lang}`)
    expect(sw).toBeLessThanOrEqual(vw)
    expect(boxes.length).toBeGreaterThan(0)
    expect(boxes[0].text.replace(/\n/g, ' ')).toMatch(L[lang].banner)
    for (const b of boxes) { expect(b.box!.x).toBeGreaterThanOrEqual(0); expect(b.box!.x + b.box!.width).toBeLessThanOrEqual(vw) }
  }
}
