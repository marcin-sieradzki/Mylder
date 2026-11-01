export async function hoverFind(page: any, expect: any, match: RegExp, radius = 160) {
  const vp = page.viewportSize()!
  const tip = page.getByRole('tooltip')
  await expect(async () => {
    let found = false
    for (let r = 0; r <= radius && !found; r += 6)
      for (let a = 0; a < 360; a += r ? (r > 60 ? 15 : 30) : 360) {
        await page.mouse.move(vp.width / 2 + r * Math.cos((a * Math.PI) / 180), vp.height / 2 + r * Math.sin((a * Math.PI) / 180))
        if ((await tip.isVisible()) && match.test(await tip.innerText())) { found = true; break }
      }
    expect(found, `a tooltip matching ${match} within ${radius}px`).toBe(true)
  }).toPass({ timeout: 90000 })
  return tip.innerText()
}
export async function scanTips(page: any, radius = 40) {
  const vp = page.viewportSize()!
  const tip = page.getByRole('tooltip')
  const seen = new Set<string>()
  for (let r = 0; r <= radius; r += 4)
    for (let a = 0; a < 360; a += r ? 30 : 360) {
      await page.mouse.move(vp.width / 2 + r * Math.cos((a * Math.PI) / 180), vp.height / 2 + r * Math.sin((a * Math.PI) / 180))
      if (await tip.isVisible()) seen.add((await tip.innerText()).replace(/\s+/g, ' '))
    }
  return [...seen]
}
const R = 6371000
export const dist = (a: number[], b: number[]) => {
  const x = ((b[1] - a[1]) * Math.PI / 180) * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180)
  const y = (b[0] - a[0]) * Math.PI / 180
  return Math.sqrt(x * x + y * y) * R
}
