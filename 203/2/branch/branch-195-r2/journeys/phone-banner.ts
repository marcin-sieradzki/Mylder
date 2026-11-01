import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
export default async ({ page, step, expect }: Journey) => {
  for (const lang of ['en', 'da']) {
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
    await page.waitForTimeout(3000)
    const vw = page.viewportSize()!.width
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    const boxes = []
    for (const s of await page.getByRole('status').all()) {
      if (!(await s.isVisible())) continue
      boxes.push({ text: await s.innerText(), box: await s.boundingBox() })
    }
    dump(`phone-${lang}`, { vw, sw, boxes })
    expect(sw).toBeLessThanOrEqual(vw)
    for (const b of boxes) expect(b.box!.x + b.box!.width).toBeLessThanOrEqual(vw + 0.5)
    await step(`phone ${lang}`)
  }
}
