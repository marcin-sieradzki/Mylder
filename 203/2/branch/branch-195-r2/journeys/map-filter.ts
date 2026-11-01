import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const v = page.locator('[data-vehicles]')
  await expect(v).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  const before = Number(await v.getAttribute('data-vehicles'))
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  const label = await chip.innerText()
  const bus = Number(label.match(/\d+/)?.[0])
  await step(`before filter ${before} bus ${bus}`)
  await chip.click()
  await expect(v).toHaveAttribute('data-vehicles', String(before - bus))
  await expect(chip).toContainText(String(bus))
  await step('bus off')
  await chip.click()
  await expect(v).toHaveAttribute('data-vehicles', String(before))
  await step('bus back')
}
