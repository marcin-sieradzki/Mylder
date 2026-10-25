// Screenshots of every variant in light and dark, at city zoom and close up near Nørreport,
// at phone size, plus the desktop city view for variant A. Run against `npm run start`.
//   npm run screenshots
import { launch, openPrototype, sleep } from './pw.mjs'

const CITY = { z: 10.4 }
const CLOSE = { z: 15.6, lon: 12.5713, lat: 55.6833 }
const PHONE = { viewport: { width: 390, height: 844 }, dpr: 2 }
const DESKTOP = { viewport: { width: 1440, height: 900 }, dpr: 1 }

const shots = []
for (const variant of ['a', 'b', 'c']) {
  for (const theme of ['light', 'dark']) {
    shots.push({
      name: `${variant}-${theme}-city`,
      device: PHONE,
      params: { variant, theme, ...CITY },
    })
    shots.push({
      name: `${variant}-${theme}-norreport`,
      device: PHONE,
      params: { variant, theme, ...CLOSE },
    })
  }
}
for (const theme of ['light', 'dark']) {
  shots.push({
    name: `a-${theme}-desktop`,
    device: DESKTOP,
    params: { variant: 'a', theme, z: 11.2 },
  })
}

const browser = await launch()
for (const shot of shots) {
  const context = await browser.newContext({
    viewport: shot.device.viewport,
    deviceScaleFactor: shot.device.dpr,
  })
  const page = await context.newPage()
  await openPrototype(page, shot.params)
  await sleep(1500)
  const path = `prototype-screenshots/${shot.name}.png`
  await page.screenshot({ path })
  console.error(path)
  await context.close()
}
await browser.close()
