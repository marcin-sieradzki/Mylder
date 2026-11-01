import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: on a recording (not the timetable source), About's realtime fact is unchanged from
// main, in English and Danish. The value is logged and compared between the two runs.
export default async ({ page, step, expect }: Journey) => {
  for (const [path, button, label] of [
    ['/en', 'About Mylder', "Rejseplanen's realtime"],
    ['/da', 'Om Mylder', 'Rejseplanens realtid'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByText(/16 June 2026|16\. juni 2026/).first()).toBeVisible()
    await step(`${path} map loaded on the recording`)
    await page.getByRole('button', { name: button }).click()
    const about = page.getByRole('dialog', { name: button })
    await expect(about).toBeVisible()
    const fact = about.locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::dd[1]`)
    await fact.scrollIntoViewIfNeeded()
    await step(`${path} about open`)
    const value = (await fact.innerText()).trim()
    console.log(`${label}: ${value}`)
    expect(value).not.toBe('')
    expect(value).not.toMatch(/Not connected yet|Ikke koblet på endnu/)
    await page.keyboard.press('Escape')
    await expect(about).toBeHidden()
  }
}
