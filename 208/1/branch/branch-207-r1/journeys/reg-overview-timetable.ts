import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// overview-sheet `overview-timetable`: City pulse and the Vehicles list on the timetable source, EN and DA.
export default async ({ page, step, expect }: Journey) => {
  const trips = async () => (await (await page.request.get('/api/snapshot')).json()).trips.length as number
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet).toBeVisible()
  await step('City pulse')
  const move = sheet.getByRole('group', { name: 'On the move' })
  await expect(async () => {
    const n = await trips()
    await expect(move).toContainText(`of ${n} in service`, { timeout: 1000 })
  }).toPass()
  const byMode = sheet.getByRole('region', { name: 'On the move, by mode' })
  await expect(byMode.locator('dt').first()).toBeVisible()
  for (const name of ['Reported this minute', 'Reporting live']) {
    const g = sheet.getByRole('group', { name })
    await expect(g).toContainText('—')
    await expect(g).toContainText('No live positions yet; placed from the timetable')
  }
  await expect(sheet.getByText('No realtime from the Metro; placed from the timetable')).toBeVisible()
  await expect(sheet.getByRole('group', { name: 'Average delay' })).toHaveCount(0)
  await expect(sheet.locator('time', { hasText: /^placed \d\d:\d\d:\d\d$/ }).first()).toBeVisible()
  await expect(sheet.getByText(/paused/i)).toHaveCount(0)
  await expect(sheet.getByText(/Rejseplanen ·/)).toHaveCount(0)
  const meters = sheet.getByRole('meter')
  const count = await meters.count()
  let unknown = 0
  for (let i = 0; i < count; i++) if ((await meters.nth(i).getAttribute('aria-valuetext')) === 'Unknown') unknown++
  console.log(`meters: ${count}, Unknown: ${unknown}`)
  expect(unknown).toBeGreaterThan(0)
  await step('City pulse figures checked')
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL(/tab=vehicles/)
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await expect(async () => {
    const n = await trips()
    await expect(table.getByRole('row')).toHaveCount(n + 1, { timeout: 1000 })
  }).toPass()
  await expect(table.getByRole('columnheader', { name: /Delay/ })).toHaveCount(0)
  const rows = table.getByRole('row')
  const rn = await rows.count()
  for (let i = 1; i < rn; i++) await expect(rows.nth(i)).toContainText('Timetable only')
  await step('Vehicles list')
  await sheet.getByLabel('Search lines and destinations').fill('zzz')
  await expect(sheet.getByText('No vehicles match.')).toBeVisible()
  await step('search with no match')
  await page.goto('/da')
  const da = page.getByRole('dialog', { name: 'Overblik' })
  await expect(da).toBeVisible()
  await expect(da.getByRole('region', { name: 'I bevægelse, efter transportform' })).toBeVisible()
  await expect(da.getByText('Ingen livepositioner endnu; placeret efter køreplanen').first()).toBeVisible()
  await expect(da.getByText('Ingen realtid fra Metroen; placeret efter køreplanen')).toBeVisible()
  await expect(da.getByText(/placeret ud fra/)).toHaveCount(0)
  await expect(da.locator('time', { hasText: /^placeret \d\d:\d\d:\d\d$/ }).first()).toBeVisible()
  await step('Danish City pulse')
}
