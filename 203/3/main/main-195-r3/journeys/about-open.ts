import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
export default async ({ page, step, expect }: Journey) => {
  for (const [lang, name] of [['en', 'About Mylder'], ['da', 'Om Mylder']]) {
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
    await step(`${lang} map`)
    await page.getByRole('button', { name }).click()
    const d = page.getByRole('dialog', { name })
    await expect(d).toBeVisible()
    await step(`${lang} about`)
    dump(`about-${lang}`, await d.innerText())
    await page.keyboard.press('Escape')
    await expect(d).toBeHidden()
    await step(`${lang} closed`)
  }
}
