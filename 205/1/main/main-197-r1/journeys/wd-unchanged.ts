// Pass rule 11: on the weekday recording the Overview reads as before (compare main and branch).
import { writeFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const dump: string[] = []
  for (const lang of ['en', 'da'] as const) {
    const L = lang === 'en'
      ? { sheet: 'Overview', pulse: 'City pulse', veh: /^Vehicles/, dis: /^Disruptions/, footer: 'Messages from Rejseplanen, checked 07:20.' }
      : { sheet: 'Overblik', pulse: 'Byens puls', veh: /^Køretøjer/, dis: /^Driftsforstyrrelser/, footer: '' }
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
    const sheet = page.getByRole('dialog', { name: L.sheet })
    const panel = sheet.getByRole('tabpanel')
    await expect(sheet.getByRole('group').first()).toBeVisible()
    await step(`${lang} City pulse`)
    const pulse = await panel.innerText()
    dump.push(`== ${lang} pulse\n${pulse}`)
    // the weekday's live figures, not the timetable's words
    expect(pulse).toMatch(/\d+\s*%/)
    expect(pulse).not.toMatch(/No live positions yet|Ingen livepositioner endnu/)
    expect(pulse).not.toMatch(/Timetable · placed|Køreplan · placeret/)
    for (const m of await panel.getByRole('meter').all()) {
      const v = await m.getAttribute('aria-valuetext')
      dump.push(`meter ${await m.getAttribute('aria-label')} ${v} ${await m.getAttribute('data-color')}`)
    }
    await sheet.getByRole('tab', { name: L.veh }).click()
    const table = sheet.getByRole('table')
    await expect(table).toBeVisible()
    await step(`${lang} Vehicles`)
    dump.push(`== ${lang} vehicles headers: ${(await table.getByRole('columnheader').allInnerTexts()).join(' | ')}`)
    dump.push(`== ${lang} vehicles source: ${(await panel.locator('p').first().innerText()).replace(/\s+/g, ' ')}`)
    const rows = await table.getByRole('rowgroup').nth(1).getByRole('row').count()
    dump.push(`rows ${rows} drawn ${await page.locator('[data-vehicles]').getAttribute('data-vehicles')}`)
    const states = await table.getByRole('rowgroup').nth(1).getByRole('row').evaluateAll((els) => els.map((r) => (r.lastElementChild as HTMLElement)?.innerText.trim()))
    dump.push(`states ${[...new Set(states)].join(', ')}`)
    await sheet.getByRole('tab', { name: L.dis }).click()
    await expect(panel.getByRole('list').first()).toBeVisible()
    await step(`${lang} Disruptions`)
    const dis = await panel.innerText()
    dump.push(`== ${lang} disruptions\n${dis}`)
    expect(dis).not.toMatch(/live connection|liveforbindelse/)
    if (L.footer) await expect(panel.getByText(L.footer)).toBeVisible()
    dump.push(`tab names: ${(await sheet.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | ')}`)
  }
  writeFileSync(new URL('../wd-unchanged.txt', import.meta.url), dump.join('\n'))
}
