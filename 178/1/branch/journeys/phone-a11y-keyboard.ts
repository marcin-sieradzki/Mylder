import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 4: the row reachable with the keyboard and announced by the section's name. Phone, Orientkaj St. by link (07:25-07:32).
export default async ({ page, step, expect }: Journey) => {
  await expect.poll(async () => Number((await (await page.request.get('/api/snapshot')).json()).fetched), { timeout: 150000, intervals: [2000] }).toBeGreaterThanOrEqual(Date.UTC(2026, 5, 16, 5, 25, 30))
  await page.goto('/en?stop=54307')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('link opened')
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: 'Close' }).click()
  const panel = page.getByRole('dialog', { name: 'Orientkaj St.' })
  await expect(panel).toBeVisible()
  await step('overview closed, stop sheet')
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  const list = region.getByRole('list', { name: 'At the platforms now' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  expect(await list.evaluate((el) => getComputedStyle(el).overflowX), 'the standing trips as a sideways row').toBe('auto')
  const snap = await region.ariaSnapshot()
  console.log('REGION ARIA:\n' + snap)
  const btn = list.getByRole('button', { name: 'Bus 991 to Teglholmen' })
  // keyboard: focus the sheet's first control, then Tab until the card's button holds focus
  await panel.getByRole('button').first().focus()
  let reached = false
  const trail: string[] = []
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    const name = await page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a ? `${a.tagName} ${a.getAttribute('aria-label') ?? ''} ${(a.textContent ?? '').trim().slice(0, 40)}` : '' })
    trail.push(name)
    if (await btn.evaluate((el) => el === document.activeElement)) { reached = true; break }
  }
  console.log('TAB TRAIL:\n' + trail.join('\n'))
  expect(reached).toBe(true)
  await expect(btn).toBeFocused()
  await step('card focused by Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  await step('Enter opened the vehicle')
}
