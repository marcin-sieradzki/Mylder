import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CROWDED_START,
  CROWDED_URL,
  expect,
  onScreen,
  RECORDING_DIR,
  RECORDING_START,
  serveFirstMinute,
  serveSavedArrivals,
  serveSavedStop,
  test,
} from './recording'

// Opening a stop: a tap on its marker opens its departures, the address keeps it through a reload
// and the language switch, its Arrivals tab too, and Esc closes it. The page sees the recording's
// first minute; the stop route answers from the server's own snapshot on the recording.

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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  const REFSHALEOEN = stops.find((stop) => stop.id === '48645')!

  test('a stop’s standing trips are a row that scrolls sideways above the tabs, each opening its vehicle', async ({
    page,
  }) => {
    // Refshaleøen at 07:21, where the 991 to Teglholmen stands until it leaves at 07:23. Its dot
    // sits on the stop's marker, and a tap on a dot opens the vehicle, so the buses are hidden for
    // the tap on the stop and shown again once its panel is open. A stop's sheet opens under the
    // Overview's on a phone (#175), so the Overview is closed first.
    await serveFirstMinute(page)
    await serveSavedStop(page, '48645')
    await page.goto(`/en?hide=bus&map=17.00/${REFSHALEOEN.lat}/${REFSHALEOEN.lon}`)
    await page
      .getByRole('dialog', { name: 'Overview' })
      .getByRole('button', { name: 'Close' })
      .click()
    const { width, height } = page.viewportSize()!
    const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
    await expect(async () => {
      await page.mouse.click(width / 2, height / 2)
      await expect(panel).toBeVisible({ timeout: 1_000 })
    }).toPass()
    await expect(panel).toHaveAttribute('data-anchor', 'bottom')
    const standing = panel.getByRole('region', { name: 'At the platforms now' })
    await expect(standing).toContainText(
      'No vehicle of the types shown is standing at the platforms now.',
    )

    await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()
    const row = standing.getByRole('list', { name: 'At the platforms now' })
    await expect(row).toHaveCSS('overflow-x', 'auto')
    const bus = row.getByRole('listitem').filter({ hasText: 'Teglholmen' })
    await expect(bus).toContainText('991')
    await expect(bus).toContainText('Estimated')
    await expect(bus).toContainText('07:23')
    await expect(bus).toContainText(/\d+ min|Now/)
    // One card, narrower than the row, so the next one would sit beside it; the row above the tabs.
    const card = (await bus.boundingBox())!
    const across = (await row.boundingBox())!
    expect(card.width).toBeLessThan(across.width)
    // Padded by space.200, as a row is, rather than by the raised Surface's space.300.
    await expect(bus).toHaveCSS('padding-block-start', '8px')
    await expect(bus).toHaveCSS('padding-inline-start', '8px')
    const tabs = (await panel
      .getByRole('tablist', { name: 'Departures and arrivals' })
      .boundingBox())!
    expect(card.y + card.height).toBeLessThanOrEqual(tabs.y)

    await bus.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
    await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
    await expect(page).toHaveURL(/[?&]trip=bus\.991\.7ce514fd98\.20260616\.0700(&|$)/)
  })
})

test('a stop’s panel switches to its arrivals, which the address keeps', async ({ page }) => {
  // Nørreport St., where buses and S-tog arrive throughout the recording's first half hour. Its
  // departures and arrivals are the saved answers, the same whenever the test runs.
  await serveFirstMinute(page)
  await serveSavedStop(page, '27532')
  await serveSavedArrivals(page, '27532')
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  const tabs = panel.getByRole('tablist', { name: 'Departures and arrivals' })
  await expect(tabs.getByRole('tab', { name: 'Departures' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await tabs.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(/[?&]stop=27532&board=arrivals(&|$)/)
  const arrivals = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const first = arrivals.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').first()
  await expect(first).toContainText(/From \S/)
  await expect(first).toContainText(/\d+ min|Now/)
  await expect(arrivals).toContainText('Timetable and positions')

  await page.reload()
  await expect(panel.getByRole('tab', { name: 'Arrivals' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(panel.getByRole('list', { name: 'Arrivals' })).toBeVisible()

  await panel.getByRole('tab', { name: 'Departures' }).click()
  await expect(page).not.toHaveURL(/board=/)
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
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

test('a stop where more than four trains stand lists four, and the rest on Show all', async ({
  page,
}) => {
  // København H on the crowded recording, where six trains stand from 07:20 to 07:24 by its
  // server's clock, which this test's first request starts.
  expect(CROWDED_START).toBe(RECORDING_START)
  await page.goto(`${CROWDED_URL}/en?stop=8600626`)
  const panel = page.getByRole('dialog', { name: 'København H' })
  const standing = panel.getByRole('region', { name: 'At the platforms now' })
  const trains = standing.getByRole('listitem')
  await expect(trains).toHaveCount(4)
  await expect(trains.first()).toContainText('Næstved St.')
  await expect(standing).not.toContainText('Holte St.')
  await standing.getByRole('button', { name: 'Show all 6' }).click()
  await expect(trains).toHaveCount(6)
  await expect(trains.nth(4)).toContainText('Holte St.')
  await expect(trains.nth(5)).toContainText('Hillerød St.')
  await expect(standing.getByRole('button', { name: 'Show fewer' })).toBeVisible()
})
