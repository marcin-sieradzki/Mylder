import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { opened, scale } from './helpers.ts'

// map-controls: zoom in; scale bar shorter.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en')
  await page.waitForTimeout(1500)
  const toM = (t: string) => { const m = t.match(/([\d.,]+)\s(m|km)/)!; return Number(m[1].replace(',', '')) * (m[2] === 'km' ? 1000 : 1) }
  const before = toM(await scale(page).innerText())
  await step('before zoom')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(async () => toM(await scale(page).innerText()), { timeout: 10000 }).toBeLessThan(before)
  await page.waitForTimeout(800)
  console.log('scale', before, '->', await scale(page).innerText(), 'map=', new URL(page.url()).searchParams.get('map'))
  await step('after zoom in, shorter scale')
}
