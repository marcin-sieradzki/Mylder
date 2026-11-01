import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { openTripFromMap } from './lib.ts'
// trip-open from a dot on the map, centred on a fresh snapshot position.
export default async ({ page, step, expect }: Journey) => {
  const key = await openTripFromMap(page, expect, 'en', 'bus', console.log)
  const panel = page.getByRole('dialog', { name: / to / }).last()
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Stops' })).toBeVisible()
  console.log(`opened ${key}; source ${(await panel.innerText()).split('\n').filter((l) => /·/.test(l)).pop()}`)
  await step('trip from a dot')
}
