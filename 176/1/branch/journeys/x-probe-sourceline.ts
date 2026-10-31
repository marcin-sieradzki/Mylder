import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600783&board=arrivals')
  const tp = page.getByRole('dialog', { name: 'København Syd St.' }).getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp.getByRole('time').last()).toBeVisible()
  const t = await tp.evaluate((el) => { const s = el.textContent!; const i = s.indexOf('Rejseplanen'); return s.slice(s.lastIndexOf('Rejseplanen') - 2, s.lastIndexOf('Rejseplanen') + 40) })
  console.log(JSON.stringify(t), [...t].map((c) => c.charCodeAt(0).toString(16)).join(' '))
  console.log((await tp.getByRole('time').last().evaluate((el) => el.parentElement!.outerHTML)))
  await step('source line')
}
