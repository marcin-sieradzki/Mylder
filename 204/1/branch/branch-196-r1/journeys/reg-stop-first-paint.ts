import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.addInitScript(() => {
    ;(window as any).__rows = []
    ;(window as any).__dialogs = []
    new MutationObserver(() => {
      for (const li of Array.from(document.querySelectorAll('[role="dialog"] ul[aria-label] li'))) (window as any).__rows.push(li.textContent)
      for (const d of Array.from(document.querySelectorAll('[role="dialog"]'))) (window as any).__dialogs.push(d.textContent)
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  await page.goto('/en?stop=27532')
  const nr = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(nr.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()).toContainText(/\d+ min/, { timeout: 20000 })
  const rows: string[] = await page.evaluate(() => (window as any).__rows)
  console.log(`paints recorded ${rows.length}; rows with Now: ${rows.filter((r) => /Now/.test(r)).length}`)
  expect(rows.some((r) => /Now/.test(r))).toBe(false)
  await step('Nørreport settled, never Now')
  await page.goto('/en?stop=8600783&board=arrivals')
  const syd = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(syd.getByText(/arrivals \d\d:\d\d/)).toBeVisible({ timeout: 20000 })
  const ds: string[] = await page.evaluate(() => (window as any).__dialogs)
  expect(ds.some((d) => /may be out of date/.test(d))).toBe(false)
  await step('København Syd arrivals, never out of date')
}
