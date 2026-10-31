import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  expect,
  onScreen,
  RECORDING_DIR,
  serveFirstMinute,
  serveSavedStop,
  test,
} from './recording'

// Opening a stop: a tap on its marker opens its departures, the address keeps it through a reload
// and the language switch, and Esc closes it. The page sees the recording's first minute; the
// stop route answers from the server's own snapshot on the recording.

interface Stop {
  id: string
  name: string
  lat: number
  lon: number
}
const manifest = JSON.parse(readFileSync(join(RECORDING_DIR, 'timetable', 'manifest.json'), 'utf8'))
const { stops } = JSON.parse(
  readFileSync(join(RECORDING_DIR, 'timetable', manifest.files.stops), 'utf8'),
) as { stops: Stop[] }
/** Østerport St.: no dot within 60 px of it at the opening view, nor another station. */
const OSTERPORT = stops.find((stop) => stop.name === 'Østerport St.')!

test('a tap on a stop opens its departures, which the address keeps', async ({ page }) => {
  await serveFirstMinute(page)
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')
  const { width, height } = page.viewportSize()!
  const marker = onScreen([OSTERPORT.lat, OSTERPORT.lon], width, height)
  // The stops are drawn once the timetable's network has loaded; tap until the marker is there.
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  await expect(async () => {
    await page.mouse.click(marker.x + 2, marker.y - 2)
    await expect(panel).toBeVisible({ timeout: 1_000 })
  }).toPass()
  await expect(page).toHaveURL(new RegExp(`[?&]stop=${OSTERPORT.id}(&|$)`))
  const departures = panel.getByRole('list', { name: 'Departures' })
  await expect(departures.getByRole('listitem').first()).toBeVisible()
  await expect(panel).toContainText('From the timetable')
  await expect(panel).toContainText('Timetable and positions')

  await page.reload()
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Language' })
    .getByRole('link', { name: 'Dansk' })
    .click()
  await expect(page).toHaveURL(new RegExp(`^[^?]*/da\\?.*stop=${OSTERPORT.id}`))
  await expect(panel.getByRole('list', { name: 'Afgange' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/stop=/)
})

test('a stop’s panel lists the trips standing at its platforms, and opens one’s vehicle', async ({
  page,
}) => {
  // Refshaleøen at 07:21, where the 991 to Teglholmen stands until it leaves at 07:23.
  await serveFirstMinute(page)
  await serveSavedStop(page, '48645')
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const standing = panel.getByRole('region', { name: 'At the platforms now' })
  const bus = standing.getByRole('listitem').filter({ hasText: 'Teglholmen' })
  await expect(bus).toContainText('991')
  await expect(bus).toContainText('Estimated')
  await expect(bus).toContainText('07:23')
  await expect(bus).toContainText(/\d+ min|Now/)
  await bus.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=bus\.991\.7ce514fd98\.20260616\.0700(&|$)/)
})

test('the pointer turns over a stop’s marker, as over a dot', async ({ page }) => {
  await serveFirstMinute(page)
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')
  const { width, height } = page.viewportSize()!
  const marker = onScreen([OSTERPORT.lat, OSTERPORT.lon], width, height)
  const canvas = page.locator('.maplibregl-canvas')
  await expect(async () => {
    await page.mouse.move(marker.x + 40, marker.y + 40)
    await page.mouse.move(marker.x + 2, marker.y - 2)
    await expect(canvas).toHaveCSS('cursor', 'pointer', { timeout: 500 })
  }).toPass()
  await page.mouse.move(marker.x + 60, marker.y + 60)
  await expect(canvas).not.toHaveCSS('cursor', 'pointer')
})

test('a stop’s panel leaves the map’s controls and credit in view on a wide screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/en?stop=${OSTERPORT.id}`)
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  // Once the panel has slid in.
  await expect(async () => {
    const side = (await panel.boundingBox())!
    expect(side.x + side.width).toBeGreaterThan(1250)
    for (const part of [
      page.getByRole('toolbar', { name: 'Map controls' }),
      page.getByRole('link', { name: 'Rejseplanen' }),
    ]) {
      const box = (await part.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(side.x)
    }
  }).toPass()
})

test('an unknown stop in the address opens as not found', async ({ page }) => {
  await page.goto('/en?stop=nowhere')
  await expect(page.getByRole('dialog', { name: 'Stop not found' })).toBeVisible()
})
