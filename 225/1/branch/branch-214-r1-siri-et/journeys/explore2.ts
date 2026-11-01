import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=6584')
  const sp = page.getByRole('dialog', { name: 'Nørreport St.' })
  const list = sp.getByRole('list', { name: 'Departures' })
  await expect(list).toBeVisible()
  const rows = list.getByRole('listitem')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    const t = await rows.nth(i).innerText()
    if (/Estimated/.test(t)) console.log('EST', JSON.stringify(t), await rows.nth(i).innerHTML())
  }
  console.log('ROW5', JSON.stringify(await rows.nth(5).innerText()))
  const all = await sp.innerText()
  console.log('TAIL', all.slice(-600))
}
