import type { Page } from '@playwright/test'

export const ready = async (page: Page, expect: any) => {
  await expect(page.getByRole('banner').getByText(/^(Updated|Opdateret) /)).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-vehicles]')).toBeVisible()
  await page.waitForTimeout(1500)
}
export const map = (page: Page) => page.locator('[data-vehicles]')
export const scale = (page: Page) => page.getByText(/\d+\s(m|km)$/)
export const focusMap = (page: Page) => page.getByRole('region', { name: /Live map of Copenhagen|Live-kort/ }).focus()
export const press = async (page: Page, key: string, n = 1, gap = 500) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(gap)
  }
}
export const camera = async (page: Page) => ({
  tilt: await map(page).getAttribute('data-tilt'),
  heading: await map(page).getAttribute('data-heading'),
  vehicles: await map(page).getAttribute('data-vehicles'),
  url: page.url(),
})
export const canvasMiddle = async (page: Page) => {
  const box = (await page.locator('canvas').first().boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}
export const viewportMiddle = (page: Page) => {
  const v = page.viewportSize()!
  return { x: v.width / 2, y: v.height / 2 }
}
// points within r px of (x, y), nearest first
export const around = (x: number, y: number, r = 40, step = 4) => {
  const pts: { x: number; y: number; d: number }[] = []
  for (let dx = -r; dx <= r; dx += step)
    for (let dy = -r; dy <= r; dy += step) {
      const d = Math.hypot(dx, dy)
      if (d <= r) pts.push({ x: x + dx, y: y + dy, d })
    }
  return pts.sort((a, b) => a.d - b.d)
}
export const snapshot = async (page: Page) => (await page.request.get('/api/snapshot')).json()
export const aircraft = async (page: Page) => (await page.request.get('/api/aircraft')).json()

type Pt = { x: number; y: number }
export const touchGesture = async (page: Page, from: Pt[], to: Pt[], steps = 12, stepMs = 30) => {
  const cdp = await page.context().newCDPSession(page)
  const at = (t: number) => from.map((p, i) => ({ x: p.x + (to[i].x - p.x) * t, y: p.y + (to[i].y - p.y) * t, id: i }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) })
  for (let s = 1; s <= steps; s++) {
    await page.waitForTimeout(stepMs)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(s / steps) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}
export const twist = (c: Pt, r: number, a0: number, a1: number) => {
  const p = (a: number, s: number) => ({ x: c.x + s * r * Math.cos((a * Math.PI) / 180), y: c.y + s * r * Math.sin((a * Math.PI) / 180) })
  return { from: [p(a0, 1), p(a0, -1)], to: [p(a1, 1), p(a1, -1)] }
}

// Centre the camera on a trip's drawn dot the rider's way: its shared link, Follow, Pause, close the panel, zoom in.
export const centreOnTrip = async (page: Page, expect: any, key: string, zoomClicks = 4) => {
  await page.goto(`/en?trip=${encodeURIComponent(key)}`)
  const panel = page.getByRole('dialog', { name: / to / })
  await expect(panel).toBeVisible({ timeout: 30000 })
  await ready(page, expect)
  await panel.getByRole('button', { name: 'Follow' }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(500)
  for (let i = 0; i < zoomClicks; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.waitForTimeout(1200)
  }
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.waitForTimeout(1000)
}

// Records compositor frames for ms after act(), into dir as cast-<ms>.jpg, so an ease can be seen frame by frame.
export const cast = async (page: Page, dir: string, ms: number, act: () => Promise<void>) => {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  let t0 = 0
  const frames: string[] = []
  cdp.on('Page.screencastFrame', async (f: any) => {
    const t = Date.now() - t0
    if (t0) { const name = `cast-${String(t).padStart(5, '0')}.jpg`; writeFileSync(`${dir}/${name}`, Buffer.from(f.data, 'base64')); frames.push(name) }
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 })
  await page.waitForTimeout(300)
  t0 = Date.now()
  await act()
  await page.waitForTimeout(ms)
  await cdp.send('Page.stopScreencast')
  await cdp.detach()
  return frames
}

// Finds the blobs of plane-magenta pixels in a screenshot (the rider's eye), nearest the point first.
export const findPlanes = async (page: Page, near: { x: number; y: number }) => {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async ({ png, near }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const seen = new Uint8Array(c.width * c.height)
    const isMag = (i: number) => d[i * 4] > 150 && d[i * 4 + 1] < 90 && d[i * 4 + 2] > 90
    const blobs: { x: number; y: number; n: number }[] = []
    for (let i = 0; i < c.width * c.height; i++) {
      if (seen[i] || !isMag(i)) continue
      const stack = [i]; seen[i] = 1
      let sx = 0, sy = 0, n = 0
      while (stack.length) {
        const j = stack.pop()!
        const x = j % c.width, y = (j / c.width) | 0
        sx += x; sy += y; n++
        for (const k of [j - 1, j + 1, j - c.width, j + c.width]) if (k >= 0 && k < seen.length && !seen[k] && isMag(k)) { seen[k] = 1; stack.push(k) }
      }
      if (n >= 15) blobs.push({ x: sx / n, y: sy / n, n })
    }
    return blobs.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y))
  }, { png, near })
}
