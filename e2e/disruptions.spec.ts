import { expect, test } from './recording'

// The Disruptions tab on the weekday recording: its `himsearch` answer's three messages, at
// 07:20 on Tuesday 16 June 2026.

test("the Disruptions tab lists the recording's messages, active first", async ({ page }) => {
  await page.goto('/en?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  const active = sheet.getByRole('list', { name: 'Active now' })
  await expect(active.getByText('Færre S-tog mellem København H og Hellerup')).toBeVisible()
  await expect(active.getByText('Linje 5C kører en anden rute ved Langebro')).toBeVisible()
  await expect(
    sheet
      .getByRole('list', { name: 'Later' })
      .getByText('Ingen S-tog mellem Hellerup og Holte i weekenden'),
  ).toBeVisible()
  await expect(sheet.getByText('Messages from Rejseplanen, checked 07:20.')).toBeVisible()
})

test('in Danish, on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/da?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overblik' })
  const active = sheet.getByRole('list', { name: 'Aktuelle nu' })
  await expect(active.getByText('Færre S-tog mellem København H og Hellerup')).toBeAttached()
  await expect(sheet.getByRole('tab', { name: /^Driftsforstyrrelser/ })).toHaveText(
    'Driftsforstyrrelser 3',
  )
  await expect(sheet.getByText('Fra Rejseplanen, på dansk')).toHaveCount(0)
})
