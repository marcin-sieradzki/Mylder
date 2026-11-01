// Regression, overview-delays: on ?tab=vehicles the Delay column is there, and a row's delay, opened, is the panel's Delay fact.
import { type Journey, tableFilled } from '/home/user/mylder-verify/215-journeys/lib.ts'
export default async (j: Journey) => {
  const { page, step, expect } = j
  await tableFilled(j)
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL(/tab=vehicles/)
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await expect(table.getByRole('columnheader', { name: /Delay/ })).toBeVisible()
  const headers = await table.getByRole('columnheader').allInnerTexts()
  console.log('headers', JSON.stringify(headers))
  await step('vehicles list with a Delay column')
  await sheet.getByRole('button', { name: /Delay/ }).first().click().catch(() => {})
  await step('sorted by delay')
  const rows = table.getByRole('row')
  let opened = false
  for (let i = 1; i < Math.min(30, await rows.count()) && !opened; i++) {
    const d = (await rows.nth(i).getByRole('cell').last().textContent())!.trim()
    const m = d.match(/(\d+) min (late|early)/)
    if (!m) continue
    const rowText = await rows.nth(i).innerText()
    console.log('row', JSON.stringify(rowText), 'delay', d)
    await rows.nth(i).getByRole('link').first().click()
    const panel = page.getByRole('dialog', { name: / to / })
    await expect(panel).toBeVisible()
    expect(new URL(page.url()).searchParams.get('trip')).toBeTruthy()
    const fact = panel.getByRole('term').filter({ hasText: /^Delay$/ }).locator('xpath=following-sibling::*[1]')
    const f = (await fact.innerText()).trim()
    console.log('panel delay', JSON.stringify(f))
    const ft = (await fact.textContent())!
    console.log('panel fact text', JSON.stringify(ft))
    expect(ft).toContain(`${m[1]} min ${m[2]}`)
    expect(ft).toContain(`${m[2] === 'late' ? '+' : '−'}${m[1]} min`)
    await step('opened row: panel delay matches the row')
    opened = true
  }
  expect(opened, 'a row with a delay of a minute or more').toBe(true)
}
