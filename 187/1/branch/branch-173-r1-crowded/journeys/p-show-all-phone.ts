import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600626')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('link opened on a phone')
  const overview = page.getByRole('dialog', { name: 'Overview' })
  if (await overview.isVisible()) {
    await overview.getByRole('button', { name: 'Close' }).click()
    await expect(overview).toBeHidden()
  }
  const panel = page.getByRole('dialog', { name: 'København H' })
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-anchor', 'bottom')
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  const list = region.getByRole('list', { name: 'At the platforms now' })
  await expect(list).toBeVisible()
  expect(await list.evaluate((l) => getComputedStyle(l).overflowX)).toBe('auto')
  const cards = list.getByRole('listitem')
  await expect(cards).toHaveCount(6)
  const texts = await cards.allInnerTexts()
  console.log('cards\n' + texts.join('\n---\n'))
  const want = [
    ['RE', 'Næstved St.'], ['A', 'Hundige St.'], ['A', 'Hillerød St.'],
    ['E', 'Køge St.'], ['E', 'Holte St.'], ['A', 'Hillerød St.'],
  ]
  for (const [i, [line, dest]] of want.entries()) {
    await expect(cards.nth(i)).toContainText(line)
    await expect(cards.nth(i)).toContainText(dest)
  }
  await expect(region.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
  const lb = await list.boundingBox(); const cb = await cards.first().boundingBox()
  const sw = await list.evaluate((l) => ({ scrollWidth: l.scrollWidth, clientWidth: l.clientWidth }))
  const tb = await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox()
  console.log('list', JSON.stringify(lb), 'card', JSON.stringify(cb), 'scroll', JSON.stringify(sw), 'tablist', JSON.stringify(tb))
  expect(cb!.width).toBeLessThan(lb!.width)
  expect(sw.scrollWidth).toBeGreaterThan(sw.clientWidth)
  expect(cb!.y).toBeLessThan(tb!.y)
  await step('overview closed, six cards, no Show all')
  await list.evaluate((l) => l.scrollTo({ left: l.scrollWidth }))
  await page.waitForTimeout(400)
  await expect(cards.nth(5)).toBeInViewport()
  await step('row scrolled to the sixth card')
  await cards.nth(5).getByRole('button').first().click()
  await expect(page).toHaveURL(/[?&]trip=/)
  expect(page.url()).not.toContain('stop=')
  await expect(page.getByRole('dialog', { name: /Hillerød St\./ })).toBeVisible()
  await step('sixth card opens its vehicle')
}
