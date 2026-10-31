import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Side check: what a stop's list reads at its first paint after a link, before and after the page's clock settles.
export default async ({ page, step, expect }: Journey) => {
  for (const [path, tab] of [['/en?stop=8600783', 'Departures'], ['/en?stop=8600783&board=arrivals', 'Arrivals'], ['/en?stop=27532&board=arrivals', 'Arrivals']]) {
    await page.goto(path)
    const tp = page.getByRole('dialog').getByRole('tabpanel', { name: tab })
    await expect(tp.getByRole('listitem').first()).toBeVisible()
    const a = await tp.innerText()
    await step(path + ' first paint')
    await page.waitForTimeout(3000)
    const b = await tp.innerText()
    console.log('##', path, '\nFIRST:', a.replace(/\n/g, ' | ').slice(0, 400), '\nLATER:', b.replace(/\n/g, ' | ').slice(0, 400))
    await step(path + ' 3 s later')
  }
}
