import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?trip=bus.307.46fbbb0a71.20261031.0859')
  const panel = page.getByRole('dialog', { name: /to Hillerød St\./ })
  await expect(panel).toBeVisible()
  await expect(panel.getByText(/updated/)).toBeVisible()
  await step('trip')
  console.log(await panel.ariaSnapshot())
  console.log(await panel.innerHTML().then(h=>h.slice(0,6000)))
  await page.goto('/en?stop=6584')
  const sp = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(sp.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('stop')
  console.log(await sp.ariaSnapshot())
}
