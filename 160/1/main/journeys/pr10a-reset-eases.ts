import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, scale, focusMap, press, camera, cast } from './lib.ts'
// RESET_REDUCED=1 in the file name decides: pr10a eases, pr10b runs under reduced motion.
export default async ({ page, step, expect }: Journey) => {
  const reduced = /pr10b/.test(process.argv[3])
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/en')
  await ready(page, expect)
  await step('opening place')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.waitForTimeout(1200)
  await focusMap(page)
  await press(page, 'ArrowRight', 3, 400)
  await press(page, 'Shift+ArrowUp', 4, 700)
  await press(page, 'Shift+ArrowRight', 3, 700)
  await expect(map(page)).toHaveAttribute('data-tilt', '40', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '45', { timeout: 10000 })
  await page.waitForTimeout(1500)
  const moved = await camera(page)
  console.log('moved', JSON.stringify(moved))
  await step('zoomed, panned, tilted 40, turned 45')
  await page.evaluate(() => {
    const w = window as any
    w.__log = []
    const el = document.querySelector('[data-vehicles]')!
    new MutationObserver(() => w.__log.push([Math.round(performance.now() - w.__t0), el.getAttribute('data-tilt'), el.getAttribute('data-heading')]))
      .observe(el, { attributes: true, attributeFilter: ['data-tilt', 'data-heading'] })
    document.querySelector('button[aria-label="Centre the map"]')?.addEventListener('click', () => { w.__t0 = performance.now() }, { capture: true })
  })
  const frames = await cast(page, `.verify/${process.argv[2]}/${reduced ? 'pr10b-reset-reduced-motion' : 'pr10a-reset-eases'}`, 1500, () => page.getByRole('button', { name: 'Centre the map' }).click())
  console.log('screencast frames after click:', frames.join(' '))
  await expect(map(page)).toHaveAttribute('data-tilt', '0', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '0', { timeout: 10000 })
  await page.waitForTimeout(1500)
  const log = await page.evaluate(() => (window as any).__log)
  console.log('attribute changes after click (ms, tilt, heading):', JSON.stringify(log))
  const after = await camera(page)
  console.log('after reset', JSON.stringify(after))
  await step('reset: flat, north-up, opening place')
  await expect(scale(page)).toBeVisible()
  const place = new URL(after.url).searchParams.get('map')
  expect(place === null || place === '11.20/55.68000/12.56500').toBe(true)
}
