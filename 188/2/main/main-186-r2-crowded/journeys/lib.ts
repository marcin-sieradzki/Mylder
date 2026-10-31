import type { Locator, Page } from '@playwright/test'

// What a tap at the centre of `target` would hit: the element at that point and which dialog holds it.
export async function hitAt(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded()
  // The centre of the target's first line box, where a finger lands on a wrapped link's text.
  const box = await target.evaluate((t) => {
    const r = t.getClientRects()[0] ?? t.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const hit = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py)
      const dialog = el?.closest('[role="dialog"]')
      const labelId = dialog?.getAttribute('aria-labelledby')
      const name = labelId ? document.getElementById(labelId)?.textContent : dialog?.getAttribute('aria-label')
      return { tag: el?.tagName, text: (el?.textContent ?? '').trim().slice(0, 40), dialog: name ?? null }
    },
    [x, y] as const,
  )
  const insideTarget = await target.evaluate(
    (t, [px, py]) => t.contains(document.elementFromPoint(px, py)),
    [x, y] as const,
  )
  return { x, y, ...hit, insideTarget }
}

// Asserts the tap point of `target` hits `target` itself (inside the dialog named `dialog`), then taps it there.
export async function realTap(page: Page, target: Locator, dialog: string | RegExp, log: string[]) {
  const hit = await hitAt(page, target)
  log.push(JSON.stringify(hit))
  console.log('hit', JSON.stringify(hit))
  const ok = hit.insideTarget && (typeof dialog === 'string' ? hit.dialog === dialog : dialog.test(hit.dialog ?? ''))
  if (!ok) throw new Error(`tap at ${Math.round(hit.x)},${Math.round(hit.y)} would hit <${hit.tag}> "${hit.text}" in dialog "${hit.dialog}", not the target in "${dialog}"`)
  await page.touchscreen.tap(hit.x, hit.y)
}

// Drags the Overview's header up with a finger until the sheet stands at full height.
export async function raiseOverview(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  const h = await sheet.getByRole('heading', { name: 'Overview' }).boundingBox()
  const x = h!.x + 60
  const y = h!.y + h!.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 15; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.max(5, y - i * 45) }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(800)
}

export async function tripKey(page: Page, pick: (t: any) => boolean = () => true) {
  const res = await page.request.get('/api/snapshot')
  const snap = await res.json()
  const trip = snap.trips.find(pick)
  return trip
}
