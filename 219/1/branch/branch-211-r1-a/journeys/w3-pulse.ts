import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './dump.ts'
const J = 'w3-pulse'
export default async ({ page, step, expect }: Journey) => {
  for (const [lang, sheetName, vehiclesTab, tableName] of [['en', 'Overview', /^Vehicles/, 'Vehicles'], ['da', 'Overblik', /^Køretøjer/, 'Køretøjer']] as const) {
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
    const sheet = page.getByRole('dialog', { name: sheetName })
    await expect(sheet).toBeVisible()
    if (lang === 'en') await expect(sheet.getByRole('group', { name: 'On the move' })).toContainText(/\d/)
    await page.waitForTimeout(1000)
    await step(`${lang} city pulse`)
    dump(J, `${lang}.pulse`, await sheet.innerText())
    await sheet.getByRole('tab', { name: vehiclesTab }).click()
    await expect(page).toHaveURL(/tab=vehicles/)
    const table = sheet.getByRole('table', { name: tableName })
    await expect.poll(async () => (await table.getByRole('row').count()) - 1).toBe(Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles')))
    await step(`${lang} vehicles list`)
    dump(J, `${lang}.vehicles`, await sheet.innerText())
    await sheet.getByRole('tab', { name: /^(Disruptions|Driftsforstyrrelser)/ }).click()
    await expect(page).toHaveURL(/tab=disruptions/)
    await page.waitForTimeout(500)
    await step(`${lang} disruptions`)
    dump(J, `${lang}.disruptions`, await sheet.innerText())
  }
}
