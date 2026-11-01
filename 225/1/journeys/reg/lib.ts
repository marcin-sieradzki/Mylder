import type { Page } from '@playwright/test'

export const snapshot = async (page: Page) => (await page.request.get('/api/snapshot')).json()

// Hover points within 40 px of the viewport's middle, nearest first, until a dot's card shows;
// returns the point and the card's text.
export const findDot = async (page: Page, want?: RegExp) => {
  const vp = page.viewportSize()!
  for (let r = 0; r <= 48; r += 4)
    for (let a = 0; a < 360; a += r === 0 ? 360 : 30) {
      const x = vp.width / 2 + r * Math.cos((a * Math.PI) / 180)
      const y = vp.height / 2 + r * Math.sin((a * Math.PI) / 180)
      await page.mouse.move(x, y)
      const tip = page.getByRole('tooltip')
      if (await tip.isVisible().catch(() => false)) {
        const text = await tip.innerText().catch(() => '')
        if (!want || want.test(text)) return { x, y, text }
      }
    }
  return null
}

// Opens a trip of the given mode, underway, by a tap on its dot on the map.
export const openTripFromMap = async (page: Page, expect: any, lang: string, mode: string, log: (s: string) => void) => {
  let trip: any
  await expect(async () => {
    const snap = await snapshot(page)
    const cands = snap.trips.filter((t: any) => t.mode === mode && !t.waiting && t.position)
    trip = cands[Math.floor(Math.random() * Math.min(cands.length, 40))]
    await page.goto(`/${lang}?map=14.00/${trip.position[0]}/${trip.position[1]}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 15000 })
    await page.waitForTimeout(1500)
    const vp = page.viewportSize()!
    const phone = vp.width < 600
    const word = mode === 'bus' ? /^Bus / : /^Metro /
    if (!phone) {
      const hit = await findDot(page, word)
      log(`attempt on ${trip.key}: card ${hit?.text?.replace(/\n/g, ' ')}`)
      if (hit) await page.mouse.click(hit.x, hit.y)
    } else {
      // no hover on a phone: tap rings around the middle until a trip of the mode opens
      outer: for (let r = 0; r <= 64; r += 8)
        for (let a = 0; a < 360; a += r === 0 ? 360 : 45) {
          await page.mouse.click(vp.width / 2 + r * Math.cos((a * Math.PI) / 180), vp.height / 2 + r * Math.sin((a * Math.PI) / 180))
          await page.waitForTimeout(400)
          const u = page.url()
          if (new RegExp(`[?&]trip=${mode}\\.`).test(u)) break outer
          if (/[?&](trip|stop)=/.test(u)) { log(`tap opened ${u}`); break outer }
        }
      log(`attempt on ${trip.key}: ${page.url()}`)
    }
    await expect(page).toHaveURL(new RegExp(`[?&]trip=${mode}\\.`), { timeout: 4000 })
  }).toPass({ timeout: 180000 })
  const key = decodeURIComponent(new URL(page.url()).searchParams.get('trip')!)
  log(`opened ${key} (aimed at ${trip.key} ${trip.line} to ${trip.headsign})`)
  return key
}

export const noSideways = async (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement
    const wide: string[] = []
    for (const el of Array.from(document.querySelectorAll('[role="dialog"] *'))) {
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) wide.push(`${el.tagName}.${(el as HTMLElement).className}:${Math.round(r.left)}-${Math.round(r.right)}`)
    }
    const scrollers = Array.from(document.querySelectorAll('[role="dialog"]')).map((d) => `${d.getAttribute('aria-label') ?? ''}:${(d as HTMLElement).scrollWidth}/${(d as HTMLElement).clientWidth}`)
    return { pageScroll: doc.scrollWidth, inner: window.innerWidth, wide: wide.slice(0, 10), scrollers }
  })

// Copenhagen wall time of an ISO instant, HH:MM:SS.
export const cph = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Copenhagen', hour12: false })
