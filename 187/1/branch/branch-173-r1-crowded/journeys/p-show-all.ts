import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600626')
  const panel = page.getByRole('dialog', { name: 'København H' })
  await expect(panel).toBeVisible()
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toBeVisible()
  await step('København H open')
  const rows = region.getByRole('listitem')
  await expect(rows).toHaveCount(4)
  const texts = await rows.allInnerTexts()
  console.log('collapsed rows\n' + texts.join('\n---\n'))
  const want = [
    ['RE', 'Næstved St.', /07:2[34]/],
    ['A', 'Hundige St.', '07:25'],
    ['A', 'Hillerød St.', '07:26'],
    ['E', 'Køge St.', '07:27'],
  ] as const
  for (const [i, [line, dest, time]] of want.entries()) {
    const row = rows.nth(i)
    await expect(row).toContainText(line)
    await expect(row).toContainText(dest)
    await expect(row).toContainText(time)
    await expect(row).toContainText(/Live|Estimated/)
    await expect(row).toContainText(/\d+ min|Now/)
  }
  const showAll = region.getByRole('button', { name: 'Show all 6' })
  await expect(showAll).toBeVisible()
  await expect(showAll).toHaveAttribute('aria-expanded', 'false')
  const vp = page.viewportSize()!
  const tb = await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox()
  console.log('tablist', JSON.stringify(tb), 'viewport', JSON.stringify(vp))
  await step('4 rows and Show all 6')
  await showAll.click()
  await expect(rows).toHaveCount(6)
  const all = await rows.allInnerTexts()
  console.log('expanded rows\n' + all.join('\n---\n'))
  for (const [i, [line, dest, time]] of [
    ['E', 'Holte St.', '07:28'],
    ['A', 'Hillerød St.', '07:29'],
  ].entries()) {
    const row = rows.nth(4 + i)
    await expect(row).toContainText(line)
    await expect(row).toContainText(dest)
    await expect(row).toContainText(time)
    await expect(row).toContainText(/Live|Estimated/)
  }
  const fewer = region.getByRole('button', { name: 'Show fewer' })
  await expect(fewer).toHaveAttribute('aria-expanded', 'true')
  await step('Show all clicked, 6 rows, Show fewer')
  await fewer.click()
  await expect(rows).toHaveCount(4)
  await expect(region.getByRole('button', { name: 'Show all 6' })).toHaveAttribute('aria-expanded', 'false')
  await step('Show fewer clicked, back to 4')
  await region.getByRole('button', { name: 'Show all 6' }).click()
  await expect(rows).toHaveCount(6)
  const last = rows.nth(5).getByRole('button').first()
  const name = await last.getAttribute('aria-label') ?? await last.innerText()
  console.log('last row button', name)
  await step('expanded again')
  await last.click()
  await expect(page).toHaveURL(/[?&]trip=/)
  expect(page.url()).not.toContain('stop=')
  await expect(page.getByRole('dialog', { name: /Hillerød St\./ })).toBeVisible()
  await step('sixth row opens its vehicle')
}
