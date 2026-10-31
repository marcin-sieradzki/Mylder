import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints } from './paints.ts'
// Side probe: when does København Syd St.'s Arrivals source line say "may be out of date" after the first paint has settled?
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  const snap = async () => new Date(Number((await (await page.request.get('/api/snapshot')).json()).fetched)).toISOString()
  console.log('start snapshot', await snap())
  await page.goto('/en?stop=8600783&board=arrivals')
  const tp = page.getByRole('dialog', { name: 'København Syd St.' }).getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp).toContainText(/arrivals \d\d:\d\d/, { timeout: 15000 })
  await step('settled')
  for (let i = 0; i < 9; i++) { await page.waitForTimeout(10000); console.log(`t+${(i + 1) * 10}s snapshot`, await snap()) }
  await step('90 s later')
  const all = await paints(page)
  for (const p of all) {
    const d = p.dialogs.find((x) => x.name === 'København Syd St.')
    if (!d) continue
    const src = (d.text.match(/Rejseplanen[^\n]*\n?[^\n]*\d\d:\d\d:\d\d(, may be out of date)?/) || ['?'])[0].replace(/\n/g, ' ')
    const first = d.lists.find((l) => l.label === 'Arrivals')?.rows[0]?.replace(/\n/g, ' | ')
    console.log(`${(p.t / 1000).toFixed(1)}s ${p.via}: ${src} :: ${first}`)
  }
}
