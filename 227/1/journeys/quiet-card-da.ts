import { type Journey, untilQuiet } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await untilQuiet(page, 120_000)
  await page.goto('/da?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overblik' })
  const mylder = sheet.getByRole('list', { name: 'Fra Mylder' })
  await expect(mylder).toContainText('Forsinkelser fra Rejseplanen ikke opdateret siden 09:56')
  await expect(mylder.getByRole('listitem')).toHaveCount(1)
  await expect(sheet.getByRole('tab').nth(2)).toHaveText(/1$/)
  console.log('card', JSON.stringify(await mylder.innerText()), 'tab', await sheet.getByRole('tab').nth(2).innerText())
  console.log('statuses', JSON.stringify(await page.getByRole('status').allInnerTexts()))
  for (const s of await page.getByRole('status').allInnerTexts()) expect(s).not.toMatch(/pause|svarer ikke|ikke svaret/i)
  await step('danish card')
}
