import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { mapEl, pause, toolbar } from './_common.ts'

// Pass rule 5: tabbing into the map controls, the arrow keys reach the 3D toggle and the compass; the controls stay one tab stop.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(mapEl(page)).toBeAttached()
  await expect(toolbar(page)).toBeVisible()
  const inBar = () => toolbar(page).evaluate((bar) => bar.contains(document.activeElement))
  const activeName = () =>
    page.evaluate(() => {
      const a = document.activeElement as HTMLElement
      return (a.getAttribute('aria-label') ?? a.textContent ?? '').trim()
    })
  let tabs = 0
  for (; tabs < 40 && !(await inBar()); tabs++) await page.keyboard.press('Tab')
  expect(await inBar()).toBe(true)
  const first = await activeName()
  console.log('tabs to reach controls', tabs, 'first', first)
  await step('tabbed into controls')
  const orientation = await toolbar(page).getAttribute('aria-orientation')
  const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
  console.log('toolbar orientation', orientation, 'stepping with', next)
  const order = [first]
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(next)
    await pause(150)
    const n = await activeName()
    if (n === first) break
    order.push(n)
  }
  console.log('arrow order', JSON.stringify(order))
  const tabbable = await toolbar(page).evaluate((bar) =>
    [...bar.querySelectorAll('button')].filter((b) => b.tabIndex >= 0).length,
  )
  console.log('tabbable buttons in controls', tabbable)
  const i3d = order.findIndex((n) => /3D/.test(n))
  const iNorth = order.findIndex((n) => /north/i.test(n))
  const iCentre = order.findIndex((n) => /Centre/.test(n))
  const iPause = order.findIndex((n) => /Pause/.test(n))
  expect(i3d).toBeGreaterThan(-1)
  expect(iNorth).toBeGreaterThan(-1)
  expect(i3d).toBeGreaterThan(iCentre)
  expect(iNorth).toBeGreaterThan(iCentre)
  expect(Math.max(i3d, iNorth)).toBeLessThan(iPause)
  expect(tabbable).toBe(1)
  // move to the toggle by arrows and press it with the keyboard
  for (let i = 0; i < 12 && !/3D/.test(await activeName()); i++) {
    await page.keyboard.press(next)
    await pause(150)
  }
  await step('toggle focused by arrows')
  await page.keyboard.press('Enter')
  await expect(mapEl(page)).toHaveAttribute('data-tilt', /^(4[5-9]|5[0-5])$/, { timeout: 15000 })
  await step('toggle pressed with Enter')
  await page.keyboard.press('Tab')
  expect(await inBar()).toBe(false)
  console.log('after one Tab, focus on', await activeName())
  await page.keyboard.press('Shift+Tab')
  expect(await inBar()).toBe(true)
  console.log('Shift+Tab back to', await activeName())
  await step('one tab stop')
}
