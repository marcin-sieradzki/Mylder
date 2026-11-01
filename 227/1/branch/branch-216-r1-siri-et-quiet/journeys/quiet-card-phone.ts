import { type Journey, untilQuiet } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await untilQuiet(page, 120_000)
  await page.goto('/en?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await step('phone, disruptions')
  const mylder = sheet.getByRole('list', { name: 'From Mylder' })
  await expect(mylder).toContainText('Delays from Rejseplanen not updated since 09:56')
  await mylder.scrollIntoViewIfNeeded()
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw[0], 'page scrolls sideways').toBeLessThanOrEqual(sw[1])
  const box = (await mylder.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await step('phone card fits')
}
