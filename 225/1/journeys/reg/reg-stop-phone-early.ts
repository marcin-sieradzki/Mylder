import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-standing-phone and stop-open in front of the Overview, with --phone, in the first three minutes.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?hide=bus&map=17.00/55.69105/12.60675')
  await expect(page.locator('[data-vehicles]')).toBeVisible({ timeout: 20000 })
  const ref = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(async () => {
    const vp = page.viewportSize()!
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(ref).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 40000 })
  await expect(ref).toHaveAttribute('data-anchor', 'bottom')
  const region = ref.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await step('Refshaleøen, buses hidden')
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()
  const list = region.getByRole('list', { name: 'At the platforms now' })
  await expect(list).toContainText('991', { timeout: 20000 })
  await expect(list).toContainText('Teglholmen')
  expect(await list.evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto')
  console.log(`card: ${(await list.innerText()).replace(/\n/g, ' / ')}`)
  await step('991 card in the row')
  await list.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  await expect(page).toHaveURL(/[?&]trip=/)
  await step('card opened its vehicle')
  await page.goto('/en?stop=27532')
  const nr = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(nr).toBeVisible({ timeout: 20000 })
  await step('Nørreport in front of the Overview')
  await nr.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(/board=arrivals/)
  await step('Arrivals tab tapped')
}
