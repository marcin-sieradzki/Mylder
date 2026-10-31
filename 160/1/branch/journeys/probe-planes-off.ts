import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  const el = page.locator('.maplibregl-map')
  const attrs = async () => el.evaluate((e) => Object.fromEntries([...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name, a.value])))
  console.log('planes on', JSON.stringify(await attrs()))
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Planes/ }).click()
  await page.waitForTimeout(2000)
  console.log('planes off', JSON.stringify(await attrs()))
  await step('planes off')
}
