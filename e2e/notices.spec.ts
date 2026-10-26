import { expect, SIMULATED_URL, test } from './recording'

// The page notices over the map: the browser's own Disconnected, and the source banner on every
// page whose data isn't Rejseplanen's. The time rules are the screen tests'.

test('a page whose polls fail says so at once, and the Updated line keeps its time', async ({
  page,
}) => {
  await page.goto('/en')
  const updated = page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)
  await expect(updated).toBeVisible()
  const before = await updated.textContent()

  await page.route('**/api/snapshot', (route) => route.abort('internetdisconnected'))
  // On to the next poll, a minute and a jitter on.
  await page.clock.fastForward('01:10')
  const notice = page.getByRole('status').filter({ hasText: 'No connection since' })
  await expect(notice).toHaveText(
    /^No connection since \d\d:\d\d\. Vehicles move on the last data from \d\d:\d\d:\d\d\.$/,
  )
  await expect(updated).toHaveText(before!)
})

test('a recorded page says so, with the recording’s date, and that its planes are recorded', async ({
  page,
}) => {
  // The City sheet has statuses of its own; the banner is the one that names the data.
  const banner = page.getByRole('status').filter({ hasText: /^(Recorded|Optagne)/ })
  await page.goto('/en')
  await expect(banner).toHaveText('Recorded data from 16 June 2026. Planes: recorded.')
  await page.goto('/da')
  await expect(banner).toHaveText('Optagne data fra 16. juni 2026. Fly: optaget.')
})

test('a simulated page says its vehicles are made up, and nothing of planes it has off', async ({
  page,
}) => {
  await page.goto(`${SIMULATED_URL}/en`)
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'Simulated data: vehicles and times are made up from the timetable.' })
  await expect(banner).toBeVisible()
  await expect(page.locator('[data-vehicles]')).toBeAttached()
  await expect(banner).not.toContainText('Planes')
})
