import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-standing's Show all on the crowded recording; with --phone, the row of six cards.
export default async ({ page, step, expect }: Journey) => {
  const phone = page.viewportSize()!.width < 600
  await page.goto('/en?stop=8600626')
  const kh = page.getByRole('dialog', { name: 'København H' })
  const region = kh.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('Næstved St.', { timeout: 20000 })
  const rows = region.getByRole('listitem')
  if (phone) {
    await expect(rows).toHaveCount(6)
    await expect(region.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
    await step('six cards on a phone')
    return
  }
  await expect(rows).toHaveCount(4)
  console.log(`4 rows: ${(await rows.allInnerTexts()).map((r) => r.replace(/\n/g, ' / ')).join(' | ')}`)
  const all = region.getByRole('button', { name: 'Show all 6' })
  await expect(all).toHaveAttribute('aria-expanded', 'false')
  await step('four standing, Show all 6')
  await all.click()
  await expect(rows).toHaveCount(6)
  const fewer = region.getByRole('button', { name: 'Show fewer' })
  await expect(fewer).toHaveAttribute('aria-expanded', 'true')
  console.log(`6 rows: ${(await rows.allInnerTexts()).map((r) => r.replace(/\n/g, ' / ')).join(' | ')}`)
  await step('all six')
  await rows.first().getByRole('button').first().click()
  await expect(page).toHaveURL(/[?&]trip=/)
  await step('row opened its vehicle')
}
