import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: on the timetable source in Danish, City pulse places trips "efter køreplanen" in every
// line, the Metro meter's too, and nowhere says "placeret ud fra".
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/da')
  await expect(page.getByRole('banner').getByText(/^Opdateret /)).toBeVisible()
  const sheet = page.getByRole('dialog', { name: 'Overblik' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('tab', { name: /^Byens puls/ })).toHaveAttribute('aria-selected', 'true')
  await step('Danish City pulse open')
  const metro = sheet.getByText(/^Ingen realtid fra Metroen; /)
  await metro.scrollIntoViewIfNeeded()
  await step('Metro meter line in view')
  const metroLine = (await metro.innerText()).trim()
  console.log(`Metro line: ${metroLine}`)
  const text = await sheet.innerText()
  const lines = text.split('\n').filter((l) => /placeret (?!\d)/.test(l))
  console.log(`placeret lines:\n${lines.join('\n')}`)
  expect(lines.length).toBeGreaterThan(1)
  expect(text).not.toMatch(/placeret ud fra/)
  for (const l of lines) expect(l).toMatch(/placeret efter køreplanen/)
  await expect(metro).toHaveText('Ingen realtid fra Metroen; placeret efter køreplanen')
  await expect(sheet.getByText('Ingen livepositioner endnu; placeret efter køreplanen').first()).toBeVisible()
  await expect(page.getByText(/placeret ud fra/)).toHaveCount(0)
}
