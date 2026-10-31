import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { join } from 'node:path'
import { keys, mapEl, region, rotations, toolbar } from './_common.ts'

// Pass rule 3: the compass needle follows the map's heading, and pressing it turns the map back to north.
export default async ({ page, step, expect }: Journey) => {
  const out = join('.verify', process.argv[2], 'p3-compass')
  await page.goto('/en')
  await expect(mapEl(page)).toHaveAttribute('data-heading', '0')
  const compass = toolbar(page).getByRole('button', { name: /north/i })
  await expect(compass).toBeVisible({ timeout: 5000 })
  console.log('north rotations', JSON.stringify(await rotations(page, compass)))
  await compass.screenshot({ path: join(out, 'compass-north.png') })
  await step('north-up, compass')
  await region(page).focus()
  await keys(page, 'Shift+ArrowRight', 3)
  await expect(mapEl(page)).toHaveAttribute('data-heading', '45', { timeout: 10000 })
  console.log('turned 45 rotations', JSON.stringify(await rotations(page, compass)))
  console.log('compass name turned:', await compass.getAttribute('aria-label'), '| aria snapshot:', await compass.ariaSnapshot())
  await compass.screenshot({ path: join(out, 'compass-turned-45.png') })
  await step('turned 45, needle')
  await keys(page, 'Shift+ArrowLeft', 6)
  await expect(mapEl(page)).toHaveAttribute('data-heading', '-45', { timeout: 10000 })
  console.log('turned -45 rotations', JSON.stringify(await rotations(page, compass)))
  await compass.screenshot({ path: join(out, 'compass-turned-minus45.png') })
  await step('turned -45, needle')
  // tilt too, so the reset is seen to keep the tilt
  await keys(page, 'Shift+ArrowUp', 2)
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '20', { timeout: 10000 })
  await step('turned and tilted')
  await compass.click()
  await expect(mapEl(page)).toHaveAttribute('data-heading', '0', { timeout: 15000 })
  console.log('after reset tilt', await mapEl(page).getAttribute('data-tilt'), page.url())
  console.log('after reset rotations', JSON.stringify(await rotations(page, compass)))
  await compass.screenshot({ path: join(out, 'compass-after-reset.png') })
  await expect(compass).toBeVisible()
  await step('compass pressed, map faces north')
}
