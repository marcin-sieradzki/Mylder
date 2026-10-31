import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600626')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const overview = page.getByRole('dialog', { name: 'Overview' })
  const panel = page.getByRole('dialog', { name: 'København H' })
  await expect(panel).toBeVisible()
  await expect(overview).toBeVisible() // the Overview is left open, behind
  await expect(panel).toHaveAttribute('data-anchor', 'bottom')
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  const list = region.getByRole('list', { name: 'At the platforms now' })
  await expect(list).toBeVisible()
  expect(await list.evaluate((l) => getComputedStyle(l).overflowX)).toBe('auto')
  const cards = list.getByRole('listitem')
  await expect(cards).toHaveCount(6)
  console.log('cards\n' + (await cards.allInnerTexts()).join('\n---\n'))
  const want = [
    ['RE', 'Næstved St.'], ['A', 'Hundige St.'], ['A', 'Hillerød St.'],
    ['E', 'Køge St.'], ['E', 'Holte St.'], ['A', 'Hillerød St.'],
  ]
  for (const [i, [line, dest]] of want.entries()) {
    await expect(cards.nth(i)).toContainText(line)
    await expect(cards.nth(i)).toContainText(dest)
    await expect(cards.nth(i)).toContainText(/Live|Estimated/)
  }
  await expect(panel.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
  // In front: what a finger at the first card's centre hits belongs to the stop's sheet, not the Overview.
  const front = async (i: number) => {
    const b = (await cards.nth(i).boundingBox())!
    return page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      const d = el?.closest('[role="dialog"]')
      const id = d?.getAttribute('aria-labelledby')
      return (id ? document.getElementById(id)?.textContent : d?.getAttribute('aria-label')) ?? null
    }, [b.x + Math.min(b.width, 300) / 2, b.y + b.height / 2] as const)
  }
  const hit0 = await front(0)
  console.log('first card hit belongs to', hit0)
  expect(hit0).toBe('København H')
  const vp = page.viewportSize()!
  const lb = (await list.boundingBox())!; const cb = (await cards.first().boundingBox())!
  const sw = await list.evaluate((l) => ({ scrollWidth: l.scrollWidth, clientWidth: l.clientWidth }))
  const tb = await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox()
  console.log('vp', JSON.stringify(vp), 'list', JSON.stringify(lb), 'card', JSON.stringify(cb), 'scroll', JSON.stringify(sw), 'tablist', JSON.stringify(tb))
  expect(cb.width).toBeLessThan(lb.width)
  expect(sw.scrollWidth).toBeGreaterThan(sw.clientWidth)
  expect(cb.y + cb.height, 'row at the peek').toBeLessThanOrEqual(vp.height)
  expect(cb.y).toBeLessThan(tb!.y)
  await step('stop sheet in front of the Overview, six cards, no Show all')
  // Swipe the row sideways with a finger to the sixth card.
  const cdp = await page.context().newCDPSession(page)
  const y = cb.y + cb.height / 2
  for (let n = 0; n < 6; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lb.x + lb.width - 20, y }] })
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: lb.x + lb.width - 20 - i * 30, y }] })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(300)
  }
  const left = await list.evaluate((l) => l.scrollLeft)
  console.log('scrollLeft after swipes', left)
  if (left === 0) await list.evaluate((l) => l.scrollTo({ left: l.scrollWidth }))
  await page.waitForTimeout(400)
  await expect(cards.nth(5)).toBeInViewport()
  const hit5 = await front(5)
  console.log('sixth card hit belongs to', hit5)
  expect(hit5).toBe('København H')
  await step('row swiped to the sixth card')
  await cards.nth(5).getByRole('button').first().click()
  await expect(page).toHaveURL(/[?&]trip=/)
  expect(page.url()).not.toContain('stop=')
  await expect(page.getByRole('dialog', { name: /Hillerød St\./ })).toBeVisible()
  await step('sixth card opens its vehicle')
}
