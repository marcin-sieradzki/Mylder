import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, onScreen, RECORDING_DIR, serveFirstMinute, test } from './recording'

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

test('an unknown stop in the address opens as not found', async ({ page }) => {
  await page.goto('/en?stop=nowhere')
  await expect(page.getByRole('dialog', { name: 'Stop not found' })).toBeVisible()
})
