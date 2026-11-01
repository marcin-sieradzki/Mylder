import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './dump.ts'
const J = 'w2-about'
export default async ({ page, step, expect }: Journey) => {
  for (const [lang, name] of [['en', 'About Mylder'], ['da', 'Om Mylder']]) {
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
    await step(`${lang} before about`)
    await page.getByRole('button', { name }).click()
    const dialog = page.getByRole('dialog', { name })
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(1500)
    await step(`${lang} about open`)
    dump(J, `${lang}.about`, await dialog.innerText())
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await step(`${lang} about closed`)
  }
  // from the corner credit
  await page.goto('/en')
  await page.getByRole('link', { name: 'Rejseplanen' }).click()
  await expect(page.getByRole('dialog', { name: 'About Mylder' })).toBeVisible()
  await step('about from credit')
}
