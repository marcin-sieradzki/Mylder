import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './dump.ts'
const J = 'w1-banner-legend'
export default async ({ page, step, expect }: Journey) => {
  for (const lang of ['en', 'da']) {
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
    await expect(page.getByRole('status').filter({ hasText: lang === 'en' ? /^Recorded data from 16 June 2026/ : /16\. juni 2026/ }).first()).toBeVisible()
    if (lang === 'en') {
      await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
      await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
    }
    const legend = page.getByRole('list', { name: lang === 'en' ? 'Data states' : 'Datatilstande' })
    await expect(legend).toBeVisible()
    await step(`${lang} map loaded`)
    const statuses = await page.locator('[role="status"]:not([role="dialog"] *)').allInnerTexts()
    dump(J, `${lang}.statuses`, statuses.join('\n|\n'))
    dump(J, `${lang}.legend`, await legend.locator('xpath=..').innerText())
  }
}
