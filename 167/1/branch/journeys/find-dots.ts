import type { Page } from '@playwright/test'

// Finds the vehicle dots drawn on screen: blocks of one saturated colour at least 5 px across
// (strand lines are thinner). Returns each blob's centre and width, in CSS pixels.
export async function findDots(page: Page, minX = 400) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async ({ png, minX }) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + png
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
    const sat = (i: number) => { const r = data[i], gg = data[i + 1], b = data[i + 2]; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); return mx === 0 ? 0 : (mx - mn) / mx }
    const near = (i: number, j: number) => Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) < 40
    const hits: { x: number; y: number }[] = []
    for (let y = 3; y < height - 3; y++) for (let x = Math.max(3, minX); x < width - 3; x++) {
      const i = (y * width + x) * 4
      if (sat(i) < 0.45) continue
      let ok = true
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) if (!near(i, ((y + dy) * width + x + dx) * 4)) ok = false
      if (ok) hits.push({ x, y })
    }
    const blobs: { x: number; y: number; n: number; minX: number; maxX: number; rgb: number[] }[] = []
    for (const h of hits) {
      const b = blobs.find((b) => Math.abs(b.x / b.n - h.x) < 12 && Math.abs(b.y / b.n - h.y) < 12)
      if (b) { b.x += h.x; b.y += h.y; b.n++; b.minX = Math.min(b.minX, h.x); b.maxX = Math.max(b.maxX, h.x) }
      else { const i = (h.y * width + h.x) * 4; blobs.push({ x: h.x, y: h.y, n: 1, minX: h.x, maxX: h.x, rgb: [data[i], data[i + 1], data[i + 2]] }) }
    }
    const dpr = window.devicePixelRatio
    return blobs.map((b) => ({ x: b.x / b.n / dpr, y: b.y / b.n / dpr, core: (b.maxX - b.minX + 5) / dpr, rgb: b.rgb }))
  }, { png, minX })
}

// Finds the plane glyphs drawn on screen by their magenta, as clusters' centres in CSS pixels.
export async function findPlanes(page: Page, minX = 400) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async ({ png, minX }) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + png
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
    const blobs: { x: number; y: number; n: number }[] = []
    for (let y = 0; y < height; y++) for (let x = minX; x < width; x++) {
      const i = (y * width + x) * 4, r = data[i], gg = data[i + 1], b = data[i + 2]
      if (!(r > 140 && gg < 90 && b > 80 && b < 175 && r - b > 30)) continue
      const bl = blobs.find((bl) => Math.abs(bl.x / bl.n - x) < 20 && Math.abs(bl.y / bl.n - y) < 20)
      if (bl) { bl.x += x; bl.y += y; bl.n++ } else blobs.push({ x, y, n: 1 })
    }
    const dpr = window.devicePixelRatio
    return blobs.filter((b) => b.n >= 10).map((b) => ({ x: b.x / b.n / dpr, y: b.y / b.n / dpr, n: b.n }))
  }, { png, minX })
}
