import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
const t = L.en
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const list = page.getByRole('list', { name: t.legendName })
  await expect(list).toBeVisible()
  const surface = list.locator('xpath=..')
  await step('legend')
  const text = await surface.innerText()
  dump('legend', text)
  expect(text.trim().split('\n').pop()).toMatch(t.legend)
}
