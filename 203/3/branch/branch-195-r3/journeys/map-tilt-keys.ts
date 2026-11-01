import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const v = page.locator('[data-vehicles]')
  await expect(v).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
  await step('flat')
  const map = page.getByRole('region', { name: 'Live map of Copenhagen' })
  await map.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(v).toHaveAttribute('data-tilt', '30')
  await expect(v).toHaveAttribute('data-heading', '30')
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeHidden()
  const snap = await (await page.request.get('/api/snapshot')).json()
  await expect(v).toHaveAttribute('data-vehicles', String(snap.trips.filter((t: { state: string }) => t.state !== 'cancelled').length))
  await step('tilted and turned')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(v).toHaveAttribute('data-tilt', '0')
  await expect(v).toHaveAttribute('data-heading', '0')
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeVisible()
  await step('centred')
  // Holding Shift + -> for 3 s, as a keyboard repeats it
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  const cdp = await page.context().newCDPSession(page)
  const shift = { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }
  const right = { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }
  const key = (type: 'rawKeyDown' | 'keyUp', which: object, autoRepeat = false) => cdp.send('Input.dispatchKeyEvent', { type, modifiers: 8, autoRepeat, ...which })
  const sent = [key('rawKeyDown', shift), key('rawKeyDown', right)]
  const until = Date.now() + 3000
  while (Date.now() < until) { await page.waitForTimeout(33); sent.push(key('rawKeyDown', right, true)) }
  sent.push(key('keyUp', right), key('keyUp', shift))
  await Promise.all(sent)
  await page.waitForTimeout(1500)
  const h = Number(await v.getAttribute('data-heading'))
  await step(`held 3 s heading ${h}`)
  expect(Math.abs(h)).toBeGreaterThan(60)
}
