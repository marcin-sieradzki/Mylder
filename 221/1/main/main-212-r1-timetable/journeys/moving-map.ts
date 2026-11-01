import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const dots = page.locator('[data-vehicles]')
  await expect(dots).not.toHaveAttribute('data-vehicles', '0')
  const snap = await (await page.request.get('/api/snapshot')).json()
  expect(snap.source).toEqual({ kind: 'timetable' })
  expect(snap.trips.length).toBeGreaterThan(0)
  expect(snap.trips.every((t: any) => t.state === 'timetable-only')).toBe(true)
  const n = snap.trips.filter((t: any) => !t.cancelled).length
  await expect(dots).toHaveAttribute('data-vehicles', String(n))
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  const outside = page.locator('[role="status"]:not([role="dialog"] *)')
  await expect(outside.first()).toHaveText(/^Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be\. Planes: (live|recorded) /)
  await expect(outside).toHaveCount(1)
  await expect(page.getByText(/Planes: (live|recorded)/)).toBeVisible()
  await expect(page.getByText(/paused|hasn't answered/i)).toHaveCount(0)
  const hhmmss = new Date(snap.fetched).toLocaleTimeString('en-GB', { timeZone: 'Europe/Copenhagen', hour12: false })
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  const updated = await page.getByRole('banner').getByText(/^Updated /).innerText()
  console.log(`updated line: ${updated}; snapshot fetched ${hhmmss}`)
  const legend = page.getByRole('list', { name: 'Data states' })
  await expect(legend.locator('xpath=..')).toContainText("Every vehicle is Timetable only for now: live positions aren't connected yet.")
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await step(`map drawn ${n} timetable only`)
  // filter
  const buses = snap.trips.filter((t: any) => t.mode === 'bus' && !t.cancelled).length
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  await chip.click()
  await expect(dots).toHaveAttribute('data-vehicles', String(n - buses))
  const underway = snap.trips.filter((t: any) => t.mode === 'bus' && !t.cancelled && !t.waiting).length
  await expect(chip).toHaveText(new RegExp(`^Bus\\s*${underway}$`))
  await step(`buses off (${buses})`)
  await chip.click()
  await expect(dots).toHaveAttribute('data-vehicles', String(n))
  await step('buses back')
  // controls
  const scale = page.getByText(/\d+\s(m|km)$/)
  const before = await scale.innerText()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(scale).not.toHaveText(before)
  await step('zoomed in')
  // 3d by keys
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(dots).toHaveAttribute('data-tilt', '30')
  await expect(dots).toHaveAttribute('data-heading', '30')
  await expect(scale).toBeHidden()
  await step('tilted 30 turned 30')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(dots).toHaveAttribute('data-tilt', '0')
  await expect(scale).toBeVisible()
  await step('centred')
  // card
  // positions on the timetable source run on from the snapshot's minute, so hover the busy centre
  await page.goto('/en?map=14.00/55.67600/12.56800')
  await expect(dots).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('button', { name: 'Pause' }).click()
  const vp = page.viewportSize()!
  await expect(async () => {
    for (let r = 0; r <= 260; r += 6) for (let a = 0; a < 360; a += r ? 15 : 360) {
      await page.mouse.move(vp.width / 2 + r * Math.cos(a * Math.PI / 180), vp.height / 2 + r * Math.sin(a * Math.PI / 180))
      if (await page.getByRole('tooltip').isVisible()) break
    }
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 60000 })
  await expect(page.getByRole('tooltip')).toContainText('Timetable only')
  await step('hover card')
  // Danish banner and legend
  await page.goto('/da')
  await expect(dots).not.toHaveAttribute('data-vehicles', '0')
  await expect(outside.first()).toContainText('Kun køreplan: der er endnu ingen livepositioner, så hvert køretøj er placeret, hvor køreplanen siger, det skal være.')
  await expect(page.getByRole('list', { name: 'Datatilstande' }).locator('xpath=..')).toContainText('Alle køretøjer er Kun køreplan indtil videre: der er endnu ingen livepositioner.')
  await step('da banner and legend')
}
