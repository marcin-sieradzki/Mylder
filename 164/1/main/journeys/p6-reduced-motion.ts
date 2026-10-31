import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keys, mapEl, pause, region, toolbar } from './_common.ts'

// Pass rule 6: under reduced motion the toggle and the compass jump rather than ease.
// Measured as the time from the press until the map comes to rest (data-tilt / data-heading written),
// against the same press without reduced motion, three times each.
export default async ({ page, step, expect }: Journey) => {
  const timeTo = async (attr: string, value: string, act: () => Promise<void>) =>
    {
      await page.evaluate(([a, v]) => {
        const el = document.querySelector('[data-vehicles]')!
        ;(window as any).__done = undefined
        const obs = new MutationObserver(() => {
          if (el.getAttribute(a) === v && (window as any).__done === undefined) {
            ;(window as any).__done = performance.now()
            obs.disconnect()
          }
        })
        obs.observe(el, { attributes: true, attributeFilter: [a] })
        ;(window as any).__t0 = performance.now()
      }, [attr, value])
      await act()
      await expect(mapEl(page)).toHaveAttribute(attr, value, { timeout: 15000 })
      await pause(200)
      return page.evaluate(() => Math.round((window as any).__done - (window as any).__t0))
    }
  const results: Record<string, number[]> = {}
  for (const motion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion: motion })
    await page.goto('/en')
    await expect(mapEl(page)).toHaveAttribute('data-tilt', '0')
    const toggle = toolbar(page).getByRole('button', { name: /3D/ })
    const compass = toolbar(page).getByRole('button', { name: /north/i })
    await expect(toggle).toBeVisible({ timeout: 5000 })
    await pause(1500)
    const on: number[] = [], off: number[] = [], north: number[] = []
    for (let i = 0; i < 3; i++) {
      on.push(await timeTo('data-tilt', '50', () => toggle.click()))
      if (i === 0) await step(`${motion} toggle on`)
      await pause(500)
      off.push(await timeTo('data-tilt', '0', () => toggle.click()))
      await pause(500)
    }
    for (let i = 0; i < 3; i++) {
      await region(page).focus()
      await keys(page, 'Shift+ArrowRight', 2)
      await expect(mapEl(page)).toHaveAttribute('data-heading', '30', { timeout: 10000 })
      await pause(500)
      north.push(await timeTo('data-heading', '0', () => compass.click()))
      if (i === 0) await step(`${motion} compass pressed`)
      await pause(500)
    }
    results[`${motion} toggle on`] = on
    results[`${motion} toggle off`] = off
    results[`${motion} compass`] = north
  }
  console.log('ms from press to rest', JSON.stringify(results))
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[1]
  for (const k of ['toggle on', 'toggle off', 'compass']) {
    const eased = median(results[`no-preference ${k}`])
    const jumped = median(results[`reduce ${k}`])
    console.log(k, 'eased median', eased, 'reduced median', jumped)
    expect(jumped).toBeLessThan(eased / 2)
  }
}
