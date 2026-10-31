import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Side check: does a Timetable only row carry "~" on departures as it does on arrivals?
export default async ({ page, step, expect }: Journey) => {
  for (const id of ['54307', '48645']) {
    await page.goto('/en?stop=' + id)
    const panel = page.getByRole('dialog').filter({ has: page.getByRole('tablist', { name: 'Departures and arrivals' }) })
    await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
    console.log(id, 'DEPARTURES:\n' + (await panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').allInnerTexts()).join('\n---\n'))
    await step(id + ' departures')
    await panel.getByRole('tab', { name: 'Arrivals' }).click()
    await expect(panel.getByRole('tabpanel', { name: 'Arrivals' })).toBeVisible()
    await page.waitForTimeout(1500)
    console.log(id, 'ARRIVALS:\n' + (await panel.getByRole('tabpanel', { name: 'Arrivals' }).innerText()))
    await step(id + ' arrivals')
  }
}
